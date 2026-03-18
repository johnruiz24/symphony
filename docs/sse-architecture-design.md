# SSE Architecture Design - Symphony Frontend POC

## Overview

Server-Sent Events (SSE) provide unidirectional server-to-client streaming
over a long-lived HTTP connection. The React SPA subscribes to a single SSE
endpoint and receives real-time updates as task/agent state changes.

## Why SSE (not WebSocket)

| Criterion          | SSE                          | WebSocket                    |
|--------------------|------------------------------|------------------------------|
| Direction          | Server -> Client (sufficient)| Bidirectional                |
| Auto-reconnect     | Built into EventSource spec  | Manual implementation        |
| HTTP proxy support | Works through standard HTTP  | Requires upgrade negotiation |
| Complexity         | Simple chunked HTTP response | Framing protocol overhead    |
| POC fit            | Excellent                    | Overkill for read-heavy UI   |

**Upgrade path:** If bidirectional communication is needed later (e.g., collaborative
editing), Phoenix Channels/WebSocket can be added alongside SSE.

## Connection Lifecycle

```
Client (React)                          Server (Elixir)
     |                                       |
     |  GET /api/v1/events                   |
     |  Accept: text/event-stream            |
     |  Last-Event-ID: <optional>            |
     |-------------------------------------->|
     |                                       |
     |  HTTP 200                             |
     |  Content-Type: text/event-stream      |
     |  Cache-Control: no-cache              |
     |  Connection: keep-alive               |
     |<--------------------------------------|
     |                                       |
     |  event: connected                     |
     |  id: 1                                |
     |  data: {"connection_id":"abc123",...}  |
     |<--------------------------------------|
     |                                       |
     |  event: snapshot                      |
     |  id: 2                                |
     |  data: {"tasks":[...],"agents":[...]} |
     |<--------------------------------------|
     |                                       |
     |  ... time passes ...                  |
     |                                       |
     |  event: task_updated                  |
     |  id: 15                               |
     |  data: {"task":{...}}                 |
     |<--------------------------------------|
     |                                       |
     |  event: heartbeat                     |
     |  id: 16                               |
     |  data: {}                             |
     |<--------------------------------------|
     |                                       |
     |  [connection drops]                   |
     |                                       |
     |  GET /api/v1/events                   |
     |  Last-Event-ID: 16                    |
     |-------------------------------------->|
     |                                       |
     |  [replays events 17+ if available]    |
     |  [or sends fresh snapshot]            |
     |<--------------------------------------|
```

## Event Types

### 1. `connected`
Sent immediately after connection established.
```
id: 1
event: connected
data: {"connection_id":"conn-abc123","server_time":"2026-03-18T10:00:00Z"}
```

### 2. `snapshot`
Full state dump. Sent on initial connect and on reconnection.
React replaces its entire local state with this payload.
```
id: 2
event: snapshot
data: {"tasks":[{...},{...}],"agents":[{...}]}
```

### 3. `task_created`
New task added to DynamoDB.
```
id: 10
event: task_created
data: {"task":{"id":"uuid","title":"...","status":"backlog",...}}
```

### 4. `task_updated`
Task fields changed (status transition, title edit, etc.).
```
id: 11
event: task_updated
data: {"task":{"id":"uuid","status":"in_progress","version":3,...}}
```

### 5. `task_deleted`
Task removed from DynamoDB.
```
id: 12
event: task_deleted
data: {"task":{"id":"uuid"}}
```

### 6. `task_reassigned`
Task moved to a different agent (drag-drop).
```
id: 13
event: task_reassigned
data: {"task":{"id":"uuid","assigned_agent":"worker-2",...},"previous_agent":"worker-1"}
```

### 7. `agent_state_changed`
Agent workload or status changed. Sends full agent list.
```
id: 14
event: agent_state_changed
data: {"agents":[{"id":"worker-1","status":"working","workload":{"active":1,"queued":2,"completed":5}}]}
```

### 8. `heartbeat`
Keep-alive every 15 seconds. Prevents proxy/load balancer timeout.
```
id: 15
event: heartbeat
data: {}
```

## Elixir Implementation Architecture

### PubSub Event Bus

All state changes publish to Phoenix PubSub. The SSE controller subscribes
and forwards events to connected clients.

```
TaskController (CRUD)  ----publish----> Phoenix.PubSub ("symphony:events")
Orchestrator (GenServer) --publish---->          |
                                                 |
                                        SSE Controller (subscriber)
                                                 |
                                        chunk() to each connection
```

### SSE Controller (Elixir)

```elixir
defmodule SymphonyElixirWeb.EventsController do
  use Phoenix.Controller

  @heartbeat_interval_ms 15_000

  def stream(conn, _params) do
    # Subscribe to PubSub
    Phoenix.PubSub.subscribe(SymphonyElixir.PubSub, "symphony:events")

    conn =
      conn
      |> put_resp_header("content-type", "text/event-stream")
      |> put_resp_header("cache-control", "no-cache")
      |> put_resp_header("connection", "keep-alive")
      |> put_resp_header("x-accel-buffering", "no")  # nginx buffering off
      |> send_chunked(200)

    # Send initial connected + snapshot events
    conn = send_sse(conn, "connected", %{connection_id: gen_id(), server_time: now()}, 1)
    conn = send_sse(conn, "snapshot", build_snapshot(), 2)

    # Schedule heartbeat
    Process.send_after(self(), :heartbeat, @heartbeat_interval_ms)

    # Enter receive loop
    stream_loop(conn, 3)
  end

  defp stream_loop(conn, event_id) do
    receive do
      {:symphony_event, event_type, payload} ->
        case send_sse(conn, event_type, payload, event_id) do
          {:ok, conn} -> stream_loop(conn, event_id + 1)
          {:error, _} -> conn  # Client disconnected
        end

      :heartbeat ->
        case send_sse(conn, "heartbeat", %{}, event_id) do
          {:ok, conn} ->
            Process.send_after(self(), :heartbeat, @heartbeat_interval_ms)
            stream_loop(conn, event_id + 1)
          {:error, _} -> conn
        end
    end
  end

  defp send_sse(conn, event, data, id) do
    payload = "id: #{id}\nevent: #{event}\ndata: #{Jason.encode!(data)}\n\n"
    chunk(conn, payload)
  end
end
```

### Publishing Events (from controllers/orchestrator)

```elixir
# In TaskController after a successful create:
Phoenix.PubSub.broadcast(
  SymphonyElixir.PubSub,
  "symphony:events",
  {:symphony_event, "task_created", %{task: task}}
)

# In Orchestrator after state changes:
Phoenix.PubSub.broadcast(
  SymphonyElixir.PubSub,
  "symphony:events",
  {:symphony_event, "agent_state_changed", %{agents: agents_projection}}
)
```

## Client-Side (React)

### EventSource Hook

```typescript
function useSymphonySSE(onEvent: (type: string, data: unknown) => void) {
  useEffect(() => {
    const es = new EventSource('/api/v1/events');

    es.addEventListener('snapshot', (e) => {
      onEvent('snapshot', JSON.parse(e.data));
    });

    es.addEventListener('task_created', (e) => {
      onEvent('task_created', JSON.parse(e.data));
    });

    // ... other event types

    es.onerror = () => {
      // EventSource auto-reconnects with Last-Event-ID
      // Start polling fallback after 5s of no connection
    };

    return () => es.close();
  }, [onEvent]);
}
```

### Polling Fallback

If SSE is disconnected for more than 5 seconds:
1. Start polling `GET /api/v1/tasks` + `GET /api/v1/agents` every 5s
2. Show "Reconnecting..." indicator in UI
3. Stop polling when SSE reconnects and delivers a `snapshot`

## Reconnection & Missed Events

### Best-Effort Replay (60s window)

The SSE controller maintains a bounded in-memory ring buffer of recent events
(last 60 seconds). On reconnection with `Last-Event-ID`:

1. Find the event ID in the buffer
2. If found, replay all events after it
3. If not found (gap too large), send a fresh `snapshot` instead

**Implementation:** Use an ETS table or Agent process for the event buffer.
For POC, a simple list in the controller process is acceptable.

### Why Not Guaranteed Delivery

For this POC:
- Event loss is acceptable (polling fallback catches up within 5-10s)
- No message queue (Kafka, RabbitMQ) needed
- DynamoDB is the source of truth, not the event stream
- Full `snapshot` on reconnect covers any gaps

## Performance Considerations

| Metric              | Target       | Notes                            |
|---------------------|--------------|----------------------------------|
| Event latency       | < 500ms      | PubSub -> chunk() is near-instant|
| Max connections     | 50           | POC scale (one per browser tab)  |
| Heartbeat interval  | 15s          | Balances keep-alive vs overhead  |
| Snapshot size       | < 50KB       | 100 tasks + 50 agents            |
| Memory per conn     | < 1MB        | Minimal state in receive loop    |

## CORS Configuration

**Development:** The frontend uses Vite's built-in proxy (`/api` -> `localhost:4000`),
so no CORS configuration is needed during local development.

**Production / non-Vite setups:** Add CORS headers on the Elixir side:

```elixir
plug Corsica,
  origins: ["http://localhost:3000"],
  allow_headers: ["content-type", "last-event-id"],
  allow_methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allow_credentials: true
```

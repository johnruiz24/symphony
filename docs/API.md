# Symphony API Reference

The Symphony API provides two sets of endpoints:

1. **Frontend POC API** -- Task CRUD, agent state, and real-time SSE events for the React frontend (CORS-enabled)
2. **Observability API** -- Orchestrator state snapshots and manual refresh for operational monitoring

Both are served by Phoenix when Symphony is started with the `--port` flag.

## Base URL

```
http://localhost:<port>/api/v1
```

Start Symphony with the `--port` flag to enable the API:

```bash
./bin/symphony ./WORKFLOW.md --port 4000
```

---

## Frontend POC API

These endpoints power the React frontend Kanban board, agent panel, and real-time updates. All routes are served through the `:api_cors` pipeline for cross-origin support.

### GET /api/v1/health

Health check endpoint.

**Request:**

```bash
curl http://localhost:4000/api/v1/health
```

---

### GET /api/v1/tasks

List all tasks, with optional filtering by status, priority, or assignee.

**Request:**

```bash
# All tasks
curl http://localhost:4000/api/v1/tasks

# Filter by status
curl http://localhost:4000/api/v1/tasks?status=in_progress

# Filter by priority and assignee
curl http://localhost:4000/api/v1/tasks?priority=high&assignee=agent-1
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `backlog`, `todo`, `in_progress`, `done` |
| `priority` | string | Filter by priority: `low`, `medium`, `high`, `urgent` |
| `assignee` | string | Filter by assigned agent ID |

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "task-uuid-1",
      "title": "Implement user authentication",
      "description": "Add OAuth2 login flow",
      "status": "in_progress",
      "priority": "high",
      "assigned_agent": "agent-1",
      "tags": ["auth", "backend"],
      "source": "linear",
      "version": 3,
      "created_at": "2026-03-18T10:00:00Z",
      "updated_at": "2026-03-18T11:30:00Z"
    }
  ],
  "meta": {
    "count": 1,
    "next_cursor": null
  }
}
```

---

### POST /api/v1/tasks

Create a new task.

**Request:**

```bash
curl -X POST http://localhost:4000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login redirect",
    "description": "Users are not redirected after OAuth callback",
    "status": "todo",
    "priority": "high",
    "tags": ["bugfix", "auth"]
  }'
```

**Required Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Task title (required) |

**Optional Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `description` | string | `null` | Detailed description |
| `status` | string | `"backlog"` | One of: `backlog`, `todo`, `in_progress`, `done` |
| `priority` | string | `"medium"` | One of: `low`, `medium`, `high`, `urgent` |
| `assigned_agent` | string | `null` | Agent ID to assign |
| `tags` | string[] | `[]` | Arbitrary tag labels |

**Response (201 Created):**

```json
{
  "data": {
    "id": "generated-uuid",
    "title": "Fix login redirect",
    "description": "Users are not redirected after OAuth callback",
    "status": "todo",
    "priority": "high",
    "assigned_agent": null,
    "tags": ["bugfix", "auth"],
    "source": "manual",
    "version": 1,
    "created_at": "2026-03-18T12:00:00Z",
    "updated_at": "2026-03-18T12:00:00Z"
  }
}
```

**Error (422 Validation Error):**

```json
{
  "error": {
    "code": "validation_error",
    "message": "Missing required field: title"
  }
}
```

Broadcasts `task_created` SSE event on success.

---

### GET /api/v1/tasks/:id

Get a single task by ID.

**Request:**

```bash
curl http://localhost:4000/api/v1/tasks/task-uuid-1
```

**Response (200 OK):**

```json
{
  "data": {
    "id": "task-uuid-1",
    "title": "Implement user authentication",
    "description": "Add OAuth2 login flow",
    "status": "in_progress",
    "priority": "high",
    "assigned_agent": "agent-1",
    "tags": ["auth", "backend"],
    "source": "linear",
    "version": 3,
    "created_at": "2026-03-18T10:00:00Z",
    "updated_at": "2026-03-18T11:30:00Z"
  }
}
```

**Response (404):**

```json
{
  "error": {
    "code": "task_not_found",
    "message": "Task not found"
  }
}
```

---

### PATCH /api/v1/tasks/:id

Update a task. Only provided fields are changed.

**Request:**

```bash
curl -X PATCH http://localhost:4000/api/v1/tasks/task-uuid-1 \
  -H "Content-Type: application/json" \
  -d '{"status": "done", "priority": "medium"}'
```

**Response (200 OK):** Returns the updated task in `{data: {...}}` wrapper.

Broadcasts `task_updated` SSE event on success.

---

### DELETE /api/v1/tasks/:id

Delete a task.

**Request:**

```bash
curl -X DELETE http://localhost:4000/api/v1/tasks/task-uuid-1
```

**Response (204 No Content):** Empty body.

**Response (404):** Task not found error.

Broadcasts `task_deleted` SSE event with `{id: "..."}` payload.

---

### POST /api/v1/tasks/:id/reassign

Reassign a task to a different agent. This sets the `assigned_agent` and resets status to `todo`.

**Request:**

```bash
curl -X POST http://localhost:4000/api/v1/tasks/task-uuid-1/reassign \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "agent-2"}'
```

**Required Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `agent_id` | string | Target agent ID (required, non-empty) |

**Response (200 OK):** Returns the updated task in `{data: {...}}` wrapper.

Broadcasts `task_reassigned` SSE event with `{task: {...}, agent_id: "..."}` payload.

---

### GET /api/v1/agents

List all agents (running and retrying) with their current workload and task information.

**Request:**

```bash
curl http://localhost:4000/api/v1/agents
```

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "issue-uuid",
      "name": "PROJ-42",
      "status": "working",
      "worker_host": null,
      "workload": {
        "active": 1,
        "queued": 0,
        "completed": 0
      },
      "current_task_id": "issue-uuid",
      "current_task": {
        "issue_id": "issue-uuid",
        "issue_identifier": "PROJ-42",
        "state": "In Progress",
        "started_at": "2026-03-18T11:30:00Z",
        "turn_count": 5,
        "last_event": "agent.tool_call",
        "tokens": {
          "input_tokens": 45000,
          "output_tokens": 12000,
          "total_tokens": 57000
        }
      },
      "uptime_seconds": 1800
    },
    {
      "id": "issue-uuid-2",
      "name": "PROJ-99",
      "status": "retrying",
      "worker_host": null,
      "workload": {
        "active": 0,
        "queued": 1,
        "completed": 0
      },
      "current_task_id": null,
      "current_task": null,
      "uptime_seconds": 0,
      "retry": {
        "attempt": 2,
        "error": "Codex session timed out"
      }
    }
  ],
  "meta": {
    "count": 2,
    "snapshot_at": "2026-03-18T12:00:00Z"
  }
}
```

**Agent status values:**
- `"working"` -- Agent has an active Codex session
- `"retrying"` -- Agent is in the retry queue with exponential backoff

---

### GET /api/v1/events

Server-Sent Events (SSE) stream for real-time updates. The frontend connects to this endpoint to receive live task and agent state changes without polling.

**Request:**

```bash
curl -N http://localhost:4000/api/v1/events
```

Or from JavaScript:

```javascript
const source = new EventSource('/api/v1/events');

source.addEventListener('connected', (e) => {
  const data = JSON.parse(e.data);
  console.log('Connected:', data.connection_id);
});

source.addEventListener('task_created', (e) => {
  const task = JSON.parse(e.data);
  // Update Kanban board
});

source.addEventListener('heartbeat', () => {
  // Connection alive
});
```

**Connection Lifecycle:**

1. Client opens connection
2. Server sends `connected` event with connection metadata
3. Server pushes incremental events as changes occur
4. Heartbeat every 15 seconds prevents proxy timeouts
5. Connection closes when client disconnects

**Event Types:**

| Event | Payload | Trigger |
|-------|---------|---------|
| `connected` | `{connection_id, server_time}` | On initial connection |
| `task_created` | Task object | POST /api/v1/tasks |
| `task_updated` | Task object | PATCH /api/v1/tasks/:id |
| `task_deleted` | `{id}` | DELETE /api/v1/tasks/:id |
| `task_reassigned` | `{task, agent_id}` | POST /api/v1/tasks/:id/reassign |
| `agent_state_changed` | `{source: "orchestrator"}` | Orchestrator state change |
| `heartbeat` | `{}` | Every 15 seconds |

**SSE Wire Format:**

Each event follows the standard SSE format:

```
id: 1
event: connected
data: {"connection_id":"a1b2c3d4e5f6","server_time":"2026-03-18T12:00:00Z"}

id: 2
event: task_created
data: {"id":"task-uuid","title":"New task","status":"todo",...}

id: 3
event: heartbeat
data: {}
```

**Response Headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

The `X-Accel-Buffering: no` header prevents nginx and similar proxies from buffering the stream.

---

## Observability API

These endpoints provide raw orchestrator state for operational monitoring. They predate the Frontend POC and remain useful for debugging and ops tooling.

### GET /api/v1/state

Returns the full orchestrator snapshot including all running and retrying issues, token usage totals, and rate limit status.

**Request:**

```bash
curl http://localhost:4000/api/v1/state
```

**Response (200 OK):**

```json
{
  "generated_at": "2026-03-18T12:00:00Z",
  "counts": {
    "running": 3,
    "retrying": 1
  },
  "running": [
    {
      "issue_id": "abc-123-uuid",
      "issue_identifier": "PROJ-42",
      "state": "In Progress",
      "worker_host": null,
      "workspace_path": "/home/user/code/workspaces/PROJ-42",
      "session_id": "session-uuid",
      "turn_count": 5,
      "last_event": "agent.tool_call",
      "last_message": "Running tests...",
      "started_at": "2026-03-18T11:30:00Z",
      "last_event_at": "2026-03-18T11:59:45Z",
      "tokens": {
        "input_tokens": 45000,
        "output_tokens": 12000,
        "total_tokens": 57000
      }
    }
  ],
  "retrying": [
    {
      "issue_id": "def-456-uuid",
      "issue_identifier": "PROJ-99",
      "attempt": 2,
      "due_at": "2026-03-18T12:05:00Z",
      "error": "Agent process exited unexpectedly",
      "worker_host": null,
      "workspace_path": "/home/user/code/workspaces/PROJ-99"
    }
  ],
  "codex_totals": {
    "input_tokens": 150000,
    "output_tokens": 50000,
    "total_tokens": 200000
  },
  "rate_limits": {}
}
```

**Error Response (snapshot timeout):**

```json
{
  "generated_at": "2026-03-18T12:00:00Z",
  "error": {
    "code": "snapshot_timeout",
    "message": "Snapshot timed out"
  }
}
```

---

### GET /api/v1/:issue_identifier

Returns detailed information about a specific issue by its human-readable identifier (e.g., `PROJ-42`).

**Request:**

```bash
curl http://localhost:4000/api/v1/PROJ-42
```

**Response (200 OK):**

```json
{
  "issue_identifier": "PROJ-42",
  "issue_id": "abc-123-uuid",
  "status": "running",
  "workspace": {
    "path": "/home/user/code/workspaces/PROJ-42",
    "host": null
  },
  "attempts": {
    "restart_count": 0,
    "current_retry_attempt": 0
  },
  "running": {
    "worker_host": null,
    "workspace_path": "/home/user/code/workspaces/PROJ-42",
    "session_id": "session-uuid",
    "turn_count": 5,
    "state": "In Progress",
    "started_at": "2026-03-18T11:30:00Z",
    "last_event": "agent.tool_call",
    "last_message": "Running tests...",
    "last_event_at": "2026-03-18T11:59:45Z",
    "tokens": {
      "input_tokens": 45000,
      "output_tokens": 12000,
      "total_tokens": 57000
    }
  },
  "retry": null,
  "logs": {
    "codex_session_logs": []
  },
  "recent_events": [
    {
      "at": "2026-03-18T11:59:45Z",
      "event": "agent.tool_call",
      "message": "Running tests..."
    }
  ],
  "last_error": null,
  "tracked": {}
}
```

**Response (404 Not Found):**

```json
{
  "error": {
    "code": "issue_not_found",
    "message": "Issue not found"
  }
}
```

**Status field values:**
- `"running"` -- Issue has an active agent session
- `"retrying"` -- Issue is in the retry queue awaiting next attempt

---

### POST /api/v1/refresh

Triggers an immediate poll cycle in the orchestrator, bypassing the normal polling interval.

**Request:**

```bash
curl -X POST http://localhost:4000/api/v1/refresh
```

**Response (202 Accepted):**

```json
{
  "requested_at": "2026-03-18T12:00:00Z"
}
```

**Response (503 Service Unavailable):**

```json
{
  "error": {
    "code": "orchestrator_unavailable",
    "message": "Orchestrator is unavailable"
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "code": "<error_code>",
    "message": "<human_readable_message>"
  }
}
```

### Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 404 | `not_found` | Route does not exist |
| 404 | `task_not_found` | Task ID not found in store |
| 404 | `issue_not_found` | Issue identifier not found in orchestrator state |
| 405 | `method_not_allowed` | HTTP method not supported for this route |
| 422 | `validation_error` | Invalid or missing field (see message for details) |
| 503 | `task_store_error` | Task store backend failed |
| 503 | `orchestrator_timeout` | Orchestrator snapshot timed out |
| 503 | `orchestrator_unavailable` | Orchestrator process is not responding |

---

## Web Dashboard

### GET /

The root path serves a Phoenix LiveView dashboard when accessed from a browser. The dashboard provides real-time visibility into:

- Active agent sessions with turn counts and token usage
- Retry queue with backoff timers and error details
- Aggregate token consumption across all sessions
- Rate limit status

The dashboard updates in real-time via Phoenix PubSub -- no polling or refresh needed.

### Static Assets

The dashboard loads its assets from these vendored paths:

| Path | Asset |
|------|-------|
| `/dashboard.css` | Dashboard stylesheet |
| `/vendor/phoenix_html/phoenix_html.js` | Phoenix HTML helpers |
| `/vendor/phoenix/phoenix.js` | Phoenix WebSocket client |
| `/vendor/phoenix_live_view/phoenix_live_view.js` | LiveView client runtime |

---

## Route Summary

### Frontend POC API (CORS-enabled)

| Method | Path | Controller Action | Description |
|--------|------|-------------------|-------------|
| GET | `/api/v1/health` | `HealthController :index` | Health check |
| GET | `/api/v1/tasks` | `TaskController :index` | List tasks (filterable) |
| POST | `/api/v1/tasks` | `TaskController :create` | Create task |
| GET | `/api/v1/tasks/:id` | `TaskController :show` | Get single task |
| PATCH | `/api/v1/tasks/:id` | `TaskController :update` | Update task |
| DELETE | `/api/v1/tasks/:id` | `TaskController :delete` | Delete task |
| POST | `/api/v1/tasks/:id/reassign` | `TaskController :reassign` | Reassign task to agent |
| GET | `/api/v1/agents` | `AgentController :index` | List agents + workload |
| GET | `/api/v1/events` | `EventController :stream` | SSE real-time stream |

### Observability API

| Method | Path | Controller Action | Description |
|--------|------|-------------------|-------------|
| GET | `/api/v1/state` | `ObservabilityApiController :state` | Full orchestrator state |
| GET | `/api/v1/:issue_identifier` | `ObservabilityApiController :issue` | Single issue detail |
| POST | `/api/v1/refresh` | `ObservabilityApiController :refresh` | Trigger immediate poll |

### Dashboard & Assets

| Method | Path | Controller Action | Description |
|--------|------|-------------------|-------------|
| GET | `/` | `DashboardLive :index` | LiveView dashboard (browser) |
| GET | `/dashboard.css` | `StaticAssetController :dashboard_css` | Dashboard styles |
| GET | `/vendor/phoenix_html/phoenix_html.js` | `StaticAssetController :phoenix_html_js` | Phoenix HTML JS |
| GET | `/vendor/phoenix/phoenix.js` | `StaticAssetController :phoenix_js` | Phoenix JS |
| GET | `/vendor/phoenix_live_view/phoenix_live_view.js` | `StaticAssetController :phoenix_live_view_js` | LiveView JS |

All other routes return 404 with the standard error response format.

---

## Configuration

The API timeout for orchestrator snapshots defaults to 15 seconds. This is configured in the Phoenix endpoint configuration:

```elixir
# config/config.exs
config :symphony_elixir, SymphonyElixirWeb.Endpoint,
  snapshot_timeout_ms: 15_000
```

The API server uses Bandit as the HTTP adapter and runs on the port specified via `--port` CLI flag. When `--port` is not provided, the HTTP server does not start.

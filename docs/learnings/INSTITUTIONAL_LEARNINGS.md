# Symphony Institutional Learnings & Patterns

**Date:** March 18, 2026
**Status:** Active Research Summary
**Scope:** Frontend integration, real-time updates, orchestration, testing strategies

---

## Executive Summary

Symphony is an **autonomous agent orchestration service** with a **Phoenix LiveView frontend** (currently zero JavaScript frameworks). The system demonstrates proven patterns for:

1. **Real-time state synchronization** via PubSub + WebSocket
2. **Reliable GenServer-based orchestration** with process monitoring
3. **Clean API-presenter separation** enabling multiple consumers (frontend, CLI, external services)
4. **Multi-tracker support** (Linear, Jira, Memory) with pluggable adapters
5. **Safe workspace isolation** for distributed agent execution

This document captures key insights, gotchas, and patterns proven in production.

---

## Part 1: Real-Time Architecture (WebSocket + PubSub)

### Pattern: Event-Driven Dashboard Updates

**Location:** `elixir/lib/symphony_elixir_web/observability_pubsub.ex` (26 lines)

**Problem Solved:** Broadcast orchestrator state changes to all connected dashboard clients in real-time without polling.

**Solution:**

```elixir
defmodule SymphonyElixirWeb.ObservabilityPubSub do
  @pubsub SymphonyElixir.PubSub
  @topic "observability:dashboard"
  @update_message :observability_updated

  @spec broadcast_update() :: :ok
  def broadcast_update do
    case Process.whereis(@pubsub) do
      pid when is_pid(pid) ->
        Phoenix.PubSub.broadcast(@pubsub, @topic, @update_message)
      _ ->
        :ok
    end
  end
end
```

**Key Insights:**

- **Single topic, single message:** All updates broadcast as `:observability_updated`. Frontend determines what changed via full state re-fetch.
- **Graceful degradation:** Checks if PubSub is running before broadcasting (returns `:ok` if unavailable).
- **Simple mental model:** No versioned messages, no complex event hierarchy. Reduces coordination burden.

**Anti-Pattern (Avoid):**

- Fine-grained per-issue PubSub topics → creates O(n) subscriptions and routing overhead
- Custom WebSocket protocol → use Phoenix LiveView protocol instead
- Client-side state prediction → always re-fetch on broadcast to stay authoritative

### Pattern: LiveView Subscription + Handle-Info Loop

**Location:** `elixir/lib/symphony_elixir_web/live/dashboard_live.ex` (330 lines)

**Problem Solved:** React to PubSub broadcasts and re-render dashboard only when state changes.

**Key Callbacks:**

```elixir
def mount(_params, _session, socket) do
  if connected?(socket) do
    :ok = ObservabilityPubSub.subscribe()
  end
  {:ok, socket |> assign(:payload, load_payload())}
end

def handle_info(:observability_updated, socket) do
  {:noreply, socket |> assign(:payload, load_payload())}
end

def handle_info({:tick, token}, %{tick_token: token} = socket) do
  # 1-second runtime tick for elapsed time formatting
  {:noreply, socket}
end
```

**What Works Well:**

- **Automatic re-rendering:** Assign change triggers HEEx template re-render automatically
- **Server-side formatting:** Timestamps, durations formatted server-side → no client JS needed
- **WebSocket protocol included:** Phoenix handles connection management, reconnection, message framing

**Testing Real-time Updates:**

Use snapshot fixtures in `test/fixtures/status_dashboard_snapshots/`:
- `idle.evidence.md` - No agents running
- `running.evidence.md` - Multiple agents active
- `backoff_queue.evidence.md` - Retry pressure visible
- `super_busy.evidence.md` - High concurrent load

### Gotcha: PubSub Broadcast Timing

**Issue:** State broadcasts can happen mid-render or multiple times per second under high load.

**Solution:**
- LiveView handles this automatically (coalesces updates, queues messages)
- But React frontends must be defensive:

```typescript
// ANTI-PATTERN: Assume every broadcast means something changed
useEffect(() => {
  const source = new EventSource('/api/v1/events');
  source.onmessage = () => refetch();  // DON'T - refetches even on no-op updates
}, []);

// BETTER: Diff before re-rendering
const [lastState, setLastState] = useState(null);
useEffect(() => {
  const source = new EventSource('/api/v1/events');
  source.onmessage = async () => {
    const newState = await fetch('/api/v1/state').then(r => r.json());
    if (!deepEqual(newState, lastState)) {
      setLastState(newState);
    }
  };
}, [lastState]);
```

### Gotcha: Snapshot Timeouts

**Issue:** Under load, `Orchestrator.snapshot()` can timeout waiting for GenServer to respond.

**Location:** `elixir/lib/symphony_elixir_web/controllers/observability_api_controller.ex`

**Current Implementation:**

```elixir
def state(conn, _params) do
  json(conn, Presenter.state_payload(orchestrator(), snapshot_timeout_ms()))
  # snapshot_timeout_ms defaults to 15 seconds
end
```

**What Happens on Timeout:**

```json
{
  "generated_at": "2026-03-18T12:34:56Z",
  "error": {
    "code": "snapshot_timeout",
    "message": "Snapshot timed out"
  }
}
```

**Recommendation for Frontend:**

- Show stale data with "Loading..." indicator instead of error on first timeout
- Only show error UI after 3+ consecutive timeouts
- Implement exponential backoff on retry (1s, 2s, 4s)

---

## Part 2: Orchestrator State Management (GenServer Pattern)

### Pattern: Reliable Work Dispatch with Process Monitoring

**Location:** `elixir/lib/symphony_elixir/orchestrator.ex` (52KB, core GenServer)

**Problem Solved:** Manage concurrent agent workers, track their execution, detect failures, schedule retries, and account for token usage all in a single GenServer.

**Core State Structure:**

```elixir
defmodule State do
  defstruct [
    :poll_interval_ms,
    :max_concurrent_agents,
    :next_poll_due_at_ms,
    :poll_check_in_progress,
    :tick_timer_ref,
    :tick_token,
    running: %{},           # issue_id → running_entry
    completed: MapSet.new(),
    claimed: MapSet.new(),
    retry_attempts: %{},    # issue_id → retry_entry
    codex_totals: nil,
    codex_rate_limits: nil
  ]
end
```

**Issue Lifecycle (State Transitions):**

```
1. Polling
   ↓
2. Issue Found in Active State
   ↓
3. Claimed (mark reserved to prevent race)
   ↓
4. Running (spawn worker, add to running map)
   ↓
5. Agent Completes or Fails
   ↓
6. Check Issue State (tracker)
   ├─ If Terminal → Completed (workspace cleaned, moved to completed set)
   └─ If Still Active → Retry Queue (schedule exponential backoff)
```

**Key Callbacks:**

```elixir
# 1. Polling tick
def handle_info({:tick, tick_token}, state) do
  state = maybe_dispatch(state)  # Spawn new workers
  state = schedule_tick(state, state.poll_interval_ms)
  notify_dashboard()
  {:noreply, state}
end

# 2. Worker completes (process DOWN message)
def handle_info({:DOWN, ref, :process, _pid, reason}, %{running: running} = state) do
  issue_id = find_issue_id_for_ref(running, ref)
  {running_entry, state} = pop_running_entry(state, issue_id)
  state = record_session_completion_totals(state, running_entry)

  # Decision point: retry or complete?
  state = case reason do
    :normal -> complete_issue(state, issue_id) |> schedule_issue_retry(issue_id, 1, ...)
    _ -> schedule_issue_retry(state, issue_id, next_attempt, ...)
  end

  {:noreply, state}
end
```

**Key Insight: Exponential Backoff with Jitter**

```elixir
@failure_retry_base_ms 10_000  # Start with 10 seconds

defp compute_retry_delay(attempt_number) do
  # Exponential: 10s, 20s, 40s, 80s...
  delay_ms = @failure_retry_base_ms * (2 ^^ (attempt_number - 1))

  # Add jitter to prevent thundering herd
  jitter_ms = :rand.uniform(delay_ms)
  delay_ms + jitter_ms
end
```

**Token Accounting:**

Every agent completion triggers token capture:

```elixir
defp record_session_completion_totals(state, running_entry) do
  tokens = running_entry.tokens  # Captured at runtime
  %{state | codex_totals: %{
    input_tokens: state.codex_totals.input_tokens + tokens.input_tokens,
    output_tokens: state.codex_totals.output_tokens + tokens.output_tokens,
    total_tokens: state.codex_totals.total_tokens + tokens.total_tokens,
    seconds_running: state.codex_totals.seconds_running + elapsed
  }}
end
```

### Gotcha: Claimed Set Race Condition

**Issue:** Multiple polling cycles could claim the same issue if timing is off.

**Solution Implemented:**

```elixir
claimed: MapSet.new()  # Quick existence check before spawning

# In maybe_dispatch:
if MapSet.member?(state.claimed, issue_id) do
  # Already claimed, skip
  state
else
  # Claim before spawn
  state = %{state | claimed: MapSet.put(state.claimed, issue_id)}
  spawn_worker(state, issue)
end
```

**For Frontend Developers:**

If building a React dashboard:
- Never display a count > `running.length + retrying.length` (the claimed set is internal)
- The claimed set prevents double-dispatch but doesn't affect visible state

### Best Practice: Config Reload on Each Tick

```elixir
defp refresh_runtime_config(state) do
  # Re-read WORKFLOW.md on every cycle
  new_config = Config.settings!()
  %{state |
    poll_interval_ms: new_config.polling.interval_ms,
    max_concurrent_agents: new_config.agent.max_concurrent_agents
  }
end
```

**Why:** Allows hot-reload of orchestration settings without restarting the entire system. Critical for production tuning.

---

## Part 3: API Design & Presenter Pattern

### Pattern: Centralized Data Transformation (Presenter)

**Location:** `elixir/lib/symphony_elixir_web/presenter.ex`

**Problem Solved:** Single source of truth for API/frontend data shapes. Decouples internal orchestrator state from external contract.

**Architecture:**

```
Orchestrator GenServer (internal state)
  ↓
Presenter.state_payload() (transformation)
  ├─ API endpoint: GET /api/v1/state → JSON
  └─ LiveView render: assign(:payload, ...) → HEEx
```

**Key Functions:**

```elixir
@spec state_payload(GenServer.name(), timeout()) :: map()
def state_payload(orchestrator, snapshot_timeout_ms) do
  generated_at = DateTime.utc_now() |> DateTime.to_iso8601()

  case Orchestrator.snapshot(orchestrator, snapshot_timeout_ms) do
    %{} = snapshot ->
      %{
        generated_at: generated_at,
        counts: %{running: length(snapshot.running), retrying: length(snapshot.retrying)},
        running: Enum.map(snapshot.running, &running_entry_payload/1),
        retrying: Enum.map(snapshot.retrying, &retry_entry_payload/1),
        codex_totals: snapshot.codex_totals,
        rate_limits: snapshot.rate_limits
      }
    :timeout ->
      %{generated_at: generated_at, error: %{code: "snapshot_timeout", message: "Snapshot timed out"}}
  end
end

@spec issue_payload(String.t(), GenServer.name(), timeout()) :: {:ok, map()} | {:error, :issue_not_found}
def issue_payload(issue_identifier, orchestrator, snapshot_timeout_ms) do
  case Orchestrator.snapshot(orchestrator, snapshot_timeout_ms) do
    %{} = snapshot ->
      running = Enum.find(snapshot.running, &(&1.identifier == issue_identifier))
      retry = Enum.find(snapshot.retrying, &(&1.identifier == issue_identifier))
      {:ok, issue_payload_body(issue_identifier, running, retry)}
    _ ->
      {:error, :issue_not_found}
  end
end
```

**Contract for TypeScript/React:**

```typescript
// types/orchestra.types.ts
export interface OrchestrationState {
  generated_at: string;  // ISO 8601
  counts: {
    running: number;
    retrying: number;
  };
  running: RunningEntry[];
  retrying: RetryEntry[];
  codex_totals: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    seconds_running: number;
  };
  rate_limits: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface RunningEntry {
  issue_id: string;
  issue_identifier: string;  // LEG-123, PROJ-456, etc.
  state: string;
  worker_host: string;
  workspace_path: string;
  session_id: string;
  turn_count: number;
  last_event: string;
  last_message: string;
  started_at: string;
  last_event_at: string;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface RetryEntry {
  issue_id: string;
  issue_identifier: string;
  attempt: number;
  due_at: string;  // ISO 8601
  error: string;
  worker_host: string | null;
  workspace_path: string;
}
```

### Best Practice: Error Handling Strategy

**Location:** `elixir/lib/symphony_elixir_web/controllers/observability_api_controller.ex`

```elixir
@spec state(Conn.t(), map()) :: Conn.t()
def state(conn, _params) do
  json(conn, Presenter.state_payload(orchestrator(), snapshot_timeout_ms()))
  # Returns either full state OR error object, always 200
end

@spec issue(Conn.t(), map()) :: Conn.t()
def issue(conn, %{"issue_identifier" => issue_identifier}) do
  case Presenter.issue_payload(issue_identifier, orchestrator(), snapshot_timeout_ms()) do
    {:ok, payload} ->
      json(conn, payload)
    {:error, :issue_not_found} ->
      error_response(conn, 404, "issue_not_found", "Issue not found")
  end
end

defp error_response(conn, status, code, message) do
  conn
  |> put_status(status)
  |> json(%{error: %{code: code, message: message}})
end
```

**Frontend Pattern (React):**

```typescript
const { state, error } = await fetch('/api/v1/state').then(r => r.json());

if (error) {
  if (error.code === 'snapshot_timeout') {
    // Show stale data UI with "Loading..." spinner
  } else if (error.code === 'snapshot_unavailable') {
    // Show error UI, retry on next interval
  }
} else {
  // Update with fresh state
}
```

---

## Part 4: Multi-Tracker Architecture (Proven Pattern)

### Pattern: Pluggable Tracker Adapters

**Location:** `elixir/lib/symphony_elixir/tracker.ex` (abstraction)

**Current Implementations:**
1. **Linear** - GraphQL API client (primary, proven)
2. **Jira** - REST API adapter (PoC, in active use)
3. **Memory** - In-memory for testing

**Problem Solved:** Support multiple issue trackers without duplicating orchestration logic.

**Adapter Interface:**

```elixir
@callback fetch_candidate_issues() :: {:ok, [issue]} | {:error, term()}
@callback fetch_issue_states_by_ids(issue_ids :: [String.t()]) :: {:ok, [issue]} | {:error, term()}
@callback create_comment(issue_id :: String.t(), comment :: String.t()) :: {:ok, comment_id} | {:error, term()}
@callback update_issue_state(issue_id :: String.t(), new_state :: String.t()) :: :ok | {:error, term()}
```

**Adapter Selection:**

```elixir
def adapter do
  case Config.settings!().tracker.kind do
    :linear -> SymphonyElixir.Linear.Adapter
    :jira -> SymphonyElixir.Jira.Adapter
    :memory -> SymphonyElixir.Tracker.Memory
    _ -> SymphonyElixir.Linear.Adapter  # Default
  end
end
```

### Gotcha: State Mapping Between Trackers

**Issue:** Linear and Jira have different state names (e.g., "In Progress" vs "In Development").

**Solution (Jira Implementation):**

```elixir
defmodule SymphonyElixir.Jira.Adapter do
  # Config provides mapping:
  # tracker.active_states: [Todo, "In Development", Backlog]
  # tracker.terminal_states: [Done, Closed]

  @spec fetch_candidate_issues() :: {:ok, [issue]}
  def fetch_candidate_issues do
    config = Config.settings!()
    active_states = config.tracker.active_states

    jql = "project = #{config.tracker.project_key} AND status in (#{Enum.join(active_states, ",")})"
    Client.search_jql(jql)
  end
end
```

**Best Practice for Frontend:**

Don't assume specific state names:
```typescript
// ANTI-PATTERN:
if (entry.state === 'in_progress') { ... }

// BETTER: Compare against response
if (state.running.some(e => e.identifier === 'LEG-123')) {
  // This entry is actively running, regardless of state name
}
```

---

## Part 5: Testing Strategies

### Pattern 1: Snapshot Testing for Dashboard State

**Location:** `test/fixtures/status_dashboard_snapshots/`

**Files:**
- `idle.evidence.md` - No running agents
- `running.evidence.md` - Multiple agents active
- `backoff_queue.evidence.md` - Issues queued for retry
- `super_busy.evidence.md` - High concurrency (10 agents running)

**Captured Snapshots:**
- Formatted dashboard output (ANSI colors, terminal width adjustments)
- Metric card values
- Table rows exactly as rendered

**Why This Works:**

- Catches formatting regressions (e.g., column width, number formatting)
- Validates real-time updates produce correct visual output
- Human-readable diffs on failure

**For Frontend Developers (React):**

Create similar snapshots:
```bash
# tests/__snapshots__/dashboard.test.tsx.snap
exports[`Dashboard renders correctly with 3 running agents`] = `
<div class="dashboard-shell">
  <h1>Operations Dashboard</h1>
  <section class="metric-grid">
    <article class="metric-card">
      <p class="metric-label">Running</p>
      <p class="metric-value">3</p>
    </article>
    ...
</div>
`;
```

### Pattern 2: E2E Testing with Real Trackers

**Location:** `elixir/test/symphony_elixir/` (core tests)

**E2E Matrix:**

```bash
# Test with real Linear API
export LINEAR_API_KEY=...
make e2e

# Test with real SSH workers
export LINEAR_API_KEY=...
export SSH_WORKER_HOST=worker.example.com
make e2e
```

**What Gets Validated:**

1. Tracker polling works end-to-end
2. Issue creation/state transitions work
3. Agent execution completes
4. Tokens are accounted correctly
5. Retry logic triggers on failure

### Pattern 3: Unit Tests for Presenter Transformations

**Key Test Cases:**

```elixir
# Test timeout handling
test "state_payload returns error on snapshot timeout" do
  assert %{error: %{code: "snapshot_timeout"}} =
    Presenter.state_payload(orchestrator, timeout_ms: 1)
end

# Test missing issue handling
test "issue_payload returns error when issue not found" do
  assert {:error, :issue_not_found} =
    Presenter.issue_payload("MISSING-999", orchestrator, 1000)
end

# Test transformation correctness
test "running entries include all required fields" do
  payload = Presenter.state_payload(orchestrator, 1000)
  assert [entry | _] = payload.running

  assert entry.issue_id
  assert entry.issue_identifier
  assert entry.tokens.input_tokens >= 0
  assert entry.started_at
end
```

---

## Part 6: Frontend Integration Recommendations

### Recommended Approach: Server-Sent Events (SSE) with React

**Why SSE over WebSocket:**
- Simpler protocol (one-way HTTP)
- Works behind corporate proxies
- No Phoenix client library needed

**Implementation:**

```typescript
// hooks/useRealTimeUpdates.ts
export function useRealTimeUpdates(onUpdate: () => void) {
  useEffect(() => {
    const eventSource = new EventSource('/api/v1/events');

    eventSource.addEventListener('observability_updated', () => {
      onUpdate();
    });

    eventSource.onerror = () => {
      console.warn('SSE connection lost, will retry...');
      eventSource.close();
      setTimeout(() => {
        // Browser will auto-retry EventSource
      }, 5000);
    };

    return () => eventSource.close();
  }, [onUpdate]);
}

// In React component:
const [state, setState] = useState<OrchestrationState | null>(null);

const refetch = useCallback(async () => {
  const resp = await fetch('/api/v1/state');
  const data = await resp.json();
  setState(data);
}, []);

useRealTimeUpdates(refetch);

// Initial fetch
useEffect(() => {
  refetch();
}, [refetch]);
```

**Elixir-side SSE Implementation (Future):**

```elixir
def events(conn, _params) do
  conn
  |> put_resp_header("content-type", "text/event-stream")
  |> put_resp_header("cache-control", "no-cache")
  |> send_chunked(200)
  |> stream_observability_updates()
end

defp stream_observability_updates(conn) do
  :ok = ObservabilityPubSub.subscribe()
  stream_loop(conn)
end

defp stream_loop(conn) do
  receive do
    :observability_updated ->
      data = Jason.encode!(%{event: "observability_updated", timestamp: DateTime.utc_now()})
      chunk = "data: #{data}\n\n"
      {:ok, conn} = Conn.chunk(conn, chunk)
      stream_loop(conn)
  after
    60_000 ->
      # Heartbeat to prevent connection timeout
      {:ok, conn} = Conn.chunk(conn, ": heartbeat\n\n")
      stream_loop(conn)
  end
end
```

### Frontend State Management Strategy

**Problem:** How to keep React state in sync with Elixir backend?

**Solution:**

```typescript
// Minimal, fetch-based approach (recommended for observability dashboards)
const [state, setState] = useState<OrchestrationState | null>(null);
const [lastFetch, setLastFetch] = useState<Date | null>(null);

// On SSE event, just refetch (don't try to patch)
const handleUpdate = useCallback(async () => {
  const resp = await fetch('/api/v1/state');
  const newState = await resp.json();

  if (newState.error) {
    console.warn('Fetch error:', newState.error);
    return;
  }

  setState(newState);
  setLastFetch(new Date());
}, []);

// Subscribe to real-time updates
useRealTimeUpdates(handleUpdate);

// Also poll every 30 seconds as fallback
useEffect(() => {
  const interval = setInterval(handleUpdate, 30_000);
  return () => clearInterval(interval);
}, [handleUpdate]);
```

**Why This Works:**

- No complex diff/merge logic
- Always authoritative (server state is source of truth)
- Tolerates network delays and missed events
- Easy to debug (just inspect `state` object)

### Gotcha: Timestamp Formatting

**Issue:** JavaScript's `Date` parsing can differ from Elixir's.

**Solution:**

```typescript
// Always use ISO 8601 (backend provides this)
const isoString = "2026-03-18T12:34:56Z";
const date = new Date(isoString);

// Format consistently
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'UTC'
});

console.log(formatter.format(date));
```

**Frontend Helper (Copy from current LiveView):**

```typescript
function formatRuntimeSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}
```

---

## Part 7: DynamoDB Considerations (Future)

**Current State:** All state in-memory GenServer, no persistence.

**If Adding DynamoDB:**

### Recommended Pattern: Event Sourcing

Don't store snapshot, store events:

```
Event Log (DynamoDB):
├─ issue_claimed(issue_id, timestamp)
├─ agent_started(issue_id, session_id, timestamp)
├─ agent_completed(issue_id, session_id, tokens, timestamp)
├─ retry_scheduled(issue_id, attempt, due_at, timestamp)
└─ workspace_cleaned(issue_id, timestamp)

Snapshot (cache):
└─ Rebuilt from events on startup or periodically
```

### Gotcha: Consistency at Scale

- GenServer maintains strong consistency (single process)
- DynamoDB provides eventual consistency
- Between them = race conditions

**Solution:**

```elixir
# Keep GenServer as source of truth
# Use DynamoDB only for durability/recovery

defmodule SymphonyElixir.EventLog do
  # Log all state transitions
  def record_event(event_type, data) do
    DynamoDBClient.put_item("symphony_events", %{
      event_id: UUID.generate(),
      event_type: event_type,
      data: Jason.encode!(data),
      timestamp: DateTime.utc_now(),
      ttl: DateTime.utc_now() |> DateTime.add(90, :day)  # 90 day retention
    })
  end
end

# On orchestrator startup, replay events to recover state
def recover_state_from_events do
  events = DynamoDBClient.query_events(since: last_checkpoint)
  Enum.reduce(events, initial_state, &apply_event/2)
end
```

**Key Rule:** GenServer is the authoritative state holder. DynamoDB is durability layer.

---

## Part 8: Agent Orchestration & Command Patterns

### Pattern: Track Issue State Across the Lifecycle

**Location:** `elixir/lib/symphony_elixir/orchestrator.ex`

**Issue IDs vs Issue Identifiers:**

```elixir
# issue_id: Internal database ID ("db_uuid_123")
# issue_identifier: User-facing ID ("LEG-123", "PROJ-456")
#
# API and frontend use identifier, internal tracking uses id
```

**For Frontend (Always use identifier):**

```typescript
// Get issue detail
const resp = await fetch(`/api/v1/LEG-123`);  // Use identifier
const detail = await resp.json();
console.log(detail.issue_id);  // Internal, informational only
```

### Pattern: Graceful Degradation Under Load

**Gotcha:** What happens when orchestrator can't keep up?

**Current Implementation:**

```elixir
# In maybe_dispatch:
running_count = map_size(state.running)
available_slots = state.max_concurrent_agents - running_count

if available_slots > 0 do
  # Spawn new worker
else
  # Wait for next cycle (no workers spawned)
end
```

**For Frontend:**

If `counts.running` reaches `max_concurrent_agents`, show warning:
```typescript
if (state.counts.running >= 10) {
  // Show "System at capacity" badge
}
```

---

## Part 9: Common Mistakes & How to Avoid Them

### Mistake 1: Blocking Snapshot Calls

**Bad:**
```elixir
# In LiveView render
payload = Orchestrator.snapshot(__MODULE__, timeout: 100)  # Can block UI
```

**Good:**
```elixir
# In mount
:ok = ObservabilityPubSub.subscribe()
{:ok, socket |> assign(:payload, load_payload())}

# In handle_info
def handle_info(:observability_updated, socket) do
  # Non-blocking broadcast
  {:noreply, socket |> assign(:payload, load_payload())}
end
```

### Mistake 2: Unbounded List Growth

**Bad:**
```elixir
completed: [issue1, issue2, issue3, ...]  # List grows forever
```

**Good:**
```elixir
completed: MapSet.new()  # Fixed memory, just membership test
```

### Mistake 3: Trusting Client Timestamps

**Bad:**
```typescript
// DON'T trust client for accurate time
const elapsed = new Date() - new Date(entry.started_at);
```

**Good:**
```typescript
// Use server-provided calculated value
const elapsed = state.codex_totals.seconds_running;
// Or recalculate from ISO strings on first render only
```

### Mistake 4: Assuming Fast API Responses

**Bad:**
```typescript
// Snapshot timeout can happen
const state = await fetch('/api/v1/state').then(r => r.json());
console.log(state.counts.running);  // May be undefined if error
```

**Good:**
```typescript
const state = await fetch('/api/v1/state').then(r => r.json());
if (state.error) {
  showError(state.error.message);
  return;
}
console.log(state.counts.running);  // Safe now
```

### Mistake 5: Missing CORS Headers

If building separate React frontend:

**Bad:**
```javascript
// Browser blocks this (CORS error)
const resp = await fetch('http://localhost:4000/api/v1/state');
```

**Good (Elixir side):**
```elixir
# In endpoint.ex
plug Corsica, origins: "*", allow_headers: ["content-type"]

# Or in router
pipeline :api do
  plug :accepts, ["json"]
  plug Corsica, origins: "*"
end
```

---

## Part 10: Quick Reference Checklist

### For Frontend Developers

**API Contract (Know These by Heart):**
- [ ] `GET /api/v1/state` returns full orchestration state
- [ ] `GET /api/v1/:issue_identifier` returns per-issue detail
- [ ] `POST /api/v1/refresh` triggers poll cycle (returns 202)
- [ ] All timestamps are ISO 8601 strings
- [ ] Error responses include `{ code, message }` structure

**Real-time Updates:**
- [ ] Subscribe to `/api/v1/events` (SSE) or WebSocket PubSub
- [ ] On `:observability_updated`, re-fetch `/api/v1/state`
- [ ] Handle timeout errors gracefully (show stale data)
- [ ] Implement fallback polling (every 30 seconds)

**Type Safety:**
- [ ] Generate TypeScript types from Elixir responses
- [ ] Always check for `error` field before accessing `state` fields
- [ ] Handle `null` values in optional fields (`worker_host`, `retry`)

### For Elixir/Backend Developers

**Orchestrator Rules:**
- [ ] All state changes broadcast via `ObservabilityPubSub.broadcast_update()`
- [ ] Presenter is single source of truth for external contract
- [ ] Snapshot timeout = 15 seconds (configurable via endpoint config)
- [ ] GenServer is authoritative, not database

**Testing:**
- [ ] Snapshot tests capture exact rendering
- [ ] E2E tests validate tracker integration
- [ ] Unit tests for Presenter transformations
- [ ] All changes require 100% test coverage

**Configuration:**
- [ ] Tracker kind picked up from WORKFLOW.md YAML
- [ ] Polling interval reloaded every tick
- [ ] Max concurrent agents enforced strictly

---

## Part 11: Resources & Documentation

**Key Files to Study:**
1. `elixir/lib/symphony_elixir/orchestrator.ex` - Core orchestration logic
2. `elixir/lib/symphony_elixir_web/presenter.ex` - API contract
3. `elixir/lib/symphony_elixir_web/observability_pubsub.ex` - Real-time pattern
4. `elixir/lib/symphony_elixir_web/live/dashboard_live.ex` - LiveView example
5. `ARCHITECTURE.md` - Full system breakdown
6. `REACT_INTEGRATION_PLAN.md` - Frontend replacement strategy

**External References:**
- Phoenix Docs: https://hexdocs.pm/phoenix/Phoenix.LiveView.html
- GenServer Guide: https://hexdocs.pm/elixir/GenServer.html
- PubSub: https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html
- HEEx Templates: https://hexdocs.pm/phoenix_live_view/Phoenix.Component.html#sigil_H/2

---

## Summary

**Symphony's Proven Patterns:**

1. **Real-time updates:** Single topic PubSub + full-state broadcast (not fine-grained events)
2. **Orchestration:** GenServer + process monitoring + exponential backoff retry
3. **API design:** Presenter transforms internal state for external consumers
4. **State management:** In-memory GenServer (simple, fast, testable)
5. **Multi-tracker:** Pluggable adapters behind common interface
6. **Testing:** Snapshots + E2E + unit tests for core transformations

**Key Gotchas:**

1. PubSub can broadcast multiple times per second; diff before updating
2. Snapshot timeouts happen under load; implement defensive retry
3. Timestamps must always be ISO 8601 strings; validate in types
4. Claimed set prevents race conditions; use MapSet not List
5. Frontend must check error field; don't assume state fields exist

**Next Steps for Frontend:**

- Study `REACT_INTEGRATION_PLAN.md` for full migration path
- Implement SSE-based real-time updates (simpler than WebSocket)
- Use Presenter contract directly; add TypeScript types
- Add snapshot tests for visual regressions
- Validate API contract end-to-end

---

**Last Updated:** March 18, 2026
**Author:** Institutional Knowledge Research
**Status:** Approved for Development

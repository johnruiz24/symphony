# Elixir Router & Controller Structure - Symphony Frontend POC

## Router Design

The new API endpoints are added alongside the existing observability endpoints.
A new `TaskApiController` and `AgentApiController` are introduced to keep
concerns separated. A CORS plug is added for cross-origin React access.

### Proposed Router (`lib/symphony_elixir_web/router.ex`)

```elixir
defmodule SymphonyElixirWeb.Router do
  use Phoenix.Router
  import Phoenix.LiveView.Router

  # ---- Pipelines ----

  pipeline :browser do
    plug(:fetch_session)
    plug(:fetch_live_flash)
    plug(:put_root_layout, html: {SymphonyElixirWeb.Layouts, :root})
    plug(:protect_from_forgery)
    plug(:put_secure_browser_headers)
  end

  pipeline :api do
    plug Corsica,
      origins: ["http://localhost:3000"],
      allow_headers: ["content-type", "last-event-id", "accept"],
      allow_methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allow_credentials: true
  end

  # ---- Static assets (existing) ----
  scope "/", SymphonyElixirWeb do
    get("/dashboard.css", StaticAssetController, :dashboard_css)
    get("/vendor/phoenix_html/phoenix_html.js", StaticAssetController, :phoenix_html_js)
    get("/vendor/phoenix/phoenix.js", StaticAssetController, :phoenix_js)
    get("/vendor/phoenix_live_view/phoenix_live_view.js", StaticAssetController, :phoenix_live_view_js)
  end

  # ---- LiveView dashboard (existing) ----
  scope "/", SymphonyElixirWeb do
    pipe_through(:browser)
    live("/", DashboardLive, :index)
  end

  # ---- NEW: Frontend POC API ----
  scope "/api/v1", SymphonyElixirWeb do
    pipe_through(:api)

    # Health
    get "/health", HealthController, :index

    # Tasks CRUD
    get    "/tasks",              TaskApiController, :index
    post   "/tasks",              TaskApiController, :create
    get    "/tasks/:id",          TaskApiController, :show
    patch  "/tasks/:id",          TaskApiController, :update
    delete "/tasks/:id",          TaskApiController, :delete
    post   "/tasks/:id/reassign", TaskApiController, :reassign

    # Agents (read-only projection from Orchestrator)
    get "/agents", AgentApiController, :index

    # SSE Events stream
    get "/events", EventsController, :stream
  end

  # ---- Existing observability API (preserved) ----
  scope "/", SymphonyElixirWeb do
    get("/api/v1/state", ObservabilityApiController, :state)
    match(:*, "/", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/state", ObservabilityApiController, :method_not_allowed)
    post("/api/v1/refresh", ObservabilityApiController, :refresh)
    match(:*, "/api/v1/refresh", ObservabilityApiController, :method_not_allowed)
    get("/api/v1/:issue_identifier", ObservabilityApiController, :issue)
    match(:*, "/api/v1/:issue_identifier", ObservabilityApiController, :method_not_allowed)
    match(:*, "/*path", ObservabilityApiController, :not_found)
  end
end
```

**Route ordering note:** The new `/api/v1` scope with `pipe_through(:api)` is
placed BEFORE the existing catch-all observability routes. Phoenix matches
routes top-to-bottom, so specific routes must come first. The existing
`/api/v1/:issue_identifier` catch-all remains last.

## Controller Structure

### File Layout

```
lib/symphony_elixir_web/
  controllers/
    observability_api_controller.ex   # existing (unchanged)
    task_api_controller.ex            # NEW - Task CRUD + reassign
    agent_api_controller.ex           # NEW - Agent projections
    events_controller.ex              # NEW - SSE streaming
    health_controller.ex              # NEW - Health check
    fallback_controller.ex            # NEW - Shared error handling
  plugs/
    (corsica configured in router)
```

### Business Logic Layer

```
lib/symphony_elixir/
  tasks/
    tasks.ex          # Context module - DynamoDB CRUD operations
    task.ex           # Task struct + validation + state machine
    dynamo_adapter.ex # ExAws DynamoDB operations (testable adapter)
  agents/
    agents.ex         # Context module - reads from Orchestrator snapshot
    agent.ex          # Agent struct + projection logic
```

### Controller -> Context -> Adapter Flow

```
HTTP Request
  |
  v
TaskApiController        (HTTP concerns: params, status codes, JSON)
  |
  v
SymphonyElixir.Tasks     (Business logic: validation, state machine, PubSub)
  |
  v
Tasks.DynamoAdapter      (DynamoDB operations: put_item, query, etc.)
  |
  v
ExAws.Dynamo             (AWS SDK)
```

### Controller Summaries

#### TaskApiController

| Action     | Route                         | Description                    |
|------------|-------------------------------|--------------------------------|
| `index`    | GET /api/v1/tasks             | List tasks with filters        |
| `create`   | POST /api/v1/tasks            | Create task (status: backlog)  |
| `show`     | GET /api/v1/tasks/:id         | Get single task                |
| `update`   | PATCH /api/v1/tasks/:id       | Partial update with versioning |
| `delete`   | DELETE /api/v1/tasks/:id      | Hard delete                    |
| `reassign` | POST /api/v1/tasks/:id/reassign | Reassign to agent (queue-based) |

#### AgentApiController

| Action  | Route               | Description                        |
|---------|---------------------|------------------------------------|
| `index` | GET /api/v1/agents  | List agents from Orchestrator snapshot |

#### EventsController

| Action   | Route               | Description                |
|----------|---------------------|----------------------------|
| `stream` | GET /api/v1/events  | SSE long-lived connection  |

#### HealthController

| Action  | Route               | Description               |
|---------|---------------------|---------------------------|
| `index` | GET /api/v1/health  | Liveness + readiness      |

#### FallbackController

Shared error handler using Phoenix's `action_fallback` pattern:

```elixir
defmodule SymphonyElixirWeb.FallbackController do
  use Phoenix.Controller

  def call(conn, {:error, :not_found}) do
    conn |> put_status(404) |> json(%{error: %{code: "not_found", message: "Resource not found"}})
  end

  def call(conn, {:error, :validation_failed, details}) do
    conn |> put_status(422) |> json(%{error: %{code: "validation_failed", message: "Validation failed", details: details}})
  end

  def call(conn, {:error, :version_conflict}) do
    conn |> put_status(409) |> json(%{error: %{code: "version_conflict", message: "Resource was modified by another request"}})
  end

  def call(conn, {:error, :invalid_agent}) do
    conn |> put_status(400) |> json(%{error: %{code: "invalid_agent", message: "Agent not found or offline"}})
  end

  def call(conn, {:error, :service_unavailable}) do
    conn |> put_status(503) |> json(%{error: %{code: "service_unavailable", message: "Backend service unavailable"}})
  end
end
```

## Addressing 5 Critical Architecture Issues

### Issue #1: Dual Source of Truth -- POC Decision

**Decision:** DynamoDB is the canonical task store for the POC.
- Tasks created via the React UI are stored only in DynamoDB.
- The existing Orchestrator polls Linear/Jira for "issues" -- these are
  a separate concept from "tasks" in the POC.
- No synchronization between DynamoDB tasks and Linear issues in POC.
- Future: Jira/Linear sync would use the `source` field to track origin
  and a reconciliation job to keep them in sync.

### Issue #2: State Machine Ambiguity -- POC Decision

**Decision:** The Orchestrator is the authority for execution state.
DynamoDB holds the user-facing task lifecycle.

- Task lifecycle (DynamoDB): `backlog -> todo -> in_progress -> done`
- Orchestrator execution: `queued -> running -> completed` (internal)
- Agent state: derived from Orchestrator snapshot (not stored)

The React UI reads task status from DynamoDB and agent state from the
Orchestrator snapshot. These are intentionally separate projections.
No cross-system state synchronization for POC.

### Issue #3: Coupling Between React & Orchestrator -- POC Decision

**Decision:** Use 200 OK (not 202 Accepted) for reassignment in POC.
- The reassign endpoint updates DynamoDB synchronously and returns 200.
- The Orchestrator picks up the reassignment on its next tick (async).
- This means there's a brief delay between "assigned in DB" and
  "actually executing on agent" -- acceptable for POC.
- Future: Add idempotency_key for mutable operations if needed.

### Issue #4: DynamoDB Scalability Cliff -- POC Decision

**Decision:** Provisioned 100 RCU/WCU, monitor usage.
- POC handles ~100 tasks, ~50 agents. Well within limits.
- GSI design avoids hot partitions at POC scale.
- Production upgrade path documented in dynamodb-schema-design.md.

### Issue #5: SSE Isn't Guaranteed Delivery -- POC Decision

**Decision:** SSE with polling fallback (5-10s) is acceptable.
- SSE events include full entity payload (not just triggers).
- React can use the event data directly without re-fetching.
- On reconnect, server sends a fresh `snapshot` event.
- 60s ring buffer for best-effort replay of missed events.
- If SSE drops for >5s, React polls `/tasks` + `/agents`.

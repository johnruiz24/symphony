# Symphony Project Architecture & Frontend Analysis

**Date:** March 18, 2026
**Branch:** feat/explore
**Analysis Type:** Full repository research and architecture review

---

## 1. Project Overview

**Symphony** is an autonomous agent orchestration service that:
- Polls issue trackers (Linear, Jira, memory) for work
- Creates isolated workspaces per issue
- Runs Codex in app-server mode for each issue
- Provides observability via Phoenix LiveView dashboard
- Manages agent execution, retries, and completion tracking

**Current Implementation:** Elixir/OTP reference implementation
**Status:** Engineering preview for trusted environments

---

## 2. Project Layout & Structure

### Root Directory
```
/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/
├── README.md                 # Project overview and options
├── SPEC.md                   # Language-agnostic specification (80KB+)
├── LICENSE                   # Apache 2.0
├── NOTICE
├── docs/                     # Planning and brainstorms
├── elixir/                   # Reference implementation (Elixir/OTP)
├── .github/                  # PR templates and media assets
├── .codex/                   # Repository skills (commit, push, pull, land, linear)
└── tmp/                      # Temporary files
```

### Elixir Implementation Structure
```
elixir/
├── lib/
│   ├── symphony_elixir.ex                # Entry point module
│   ├── symphony_elixir/
│   │   ├── application.ex                # OTP Application supervisor
│   │   ├── orchestrator.ex               # Core polling & dispatch (52KB GenServer)
│   │   ├── agent_runner.ex               # Worker execution wrapper
│   │   ├── status_dashboard.ex           # State aggregation (60KB)
│   │   ├── config.ex                     # Configuration loader
│   │   ├── workflow.ex                   # WORKFLOW.md parser
│   │   ├── workspace.ex                  # Filesystem isolation
│   │   ├── ssh.ex                        # SSH worker support
│   │   ├── path_safety.ex                # Path validation
│   │   ├── http_server.ex                # Phoenix server startup
│   │   ├── tracker.ex                    # Tracker abstraction
│   │   ├── tracker/memory.ex             # In-memory tracker for testing
│   │   ├── linear/                       # Linear GraphQL client
│   │   ├── jira/                         # Jira REST client & adapter
│   │   ├── codex/                        # Codex app-server integration
│   │   └── config/config.exs             # Phoenix config
│   ├── symphony_elixir_web/              # Phoenix LiveView web layer
│   │   ├── endpoint.ex                   # Phoenix endpoint
│   │   ├── router.ex                     # Route definitions
│   │   ├── live/
│   │   │   └── dashboard_live.ex         # LiveView component (330 lines)
│   │   ├── components/
│   │   │   └── layouts.ex                # HTML/HEEx layouts
│   │   ├── controllers/
│   │   │   ├── observability_api_controller.ex  # JSON API endpoints
│   │   │   └── static_asset_controller.ex       # Phoenix vendor assets
│   │   ├── presenter.ex                  # API/Dashboard data models
│   │   ├── observability_pubsub.ex       # Real-time update subscriptions
│   │   └── static_assets.ex              # Asset inlining
│   ├── mix/
│   │   └── tasks/                        # Mix tasks (Jira publish, etc.)
│   └── lib/mix/tasks/                    # Additional tasks
├── test/
│   ├── symphony_elixir/                  # Unit tests
│   ├── mix/tasks/                        # Task tests
│   ├── support/                          # Test helpers & snapshots
│   └── fixtures/status_dashboard_snapshots/
├── priv/
│   └── static/
│       └── dashboard.css                 # Dashboard styling (8KB)
├── config/
│   └── config.exs                        # Phoenix configuration
├── bin/
│   └── symphony                          # Executable script
├── mix.exs                               # Mix project definition
├── mix.lock                              # Dependency lockfile
├── WORKFLOW.md                           # In-repo orchestration contract
├── README.md                             # Elixir implementation guide
├── AGENTS.md                             # Codebase conventions & rules
└── Makefile                              # Common tasks (all, e2e, lint)
```

---

## 3. Frontend Stack & Architecture

### Framework & Tools
- **Web Framework:** Phoenix 1.8.0 + Phoenix LiveView 1.1.0
- **HTTP Server:** Bandit (modern Erlang/BEAM HTTP server)
- **Real-time Updates:** Phoenix PubSub (Erlang message passing)
- **Templating:** HEEx (HTML + Elixir embedded expressions)
- **CSS:** Hand-written (dashboard.css, 8KB)
- **Static Assets:** Phoenix vendor bundles (phoenix.js, phoenix_live_view.js, phoenix_html.js)

### Key Architectural Decisions

#### 1. **No JavaScript Framework**
Symphony uses **zero JavaScript frameworks** (React, Vue, etc.):
- Dashboard rendered server-side via HEEx templates
- Client interactivity via Phoenix LiveView protocol
- Bidirectional WebSocket connection handles real-time updates
- Minimal client-side JavaScript (only Phoenix client library + small handlers)

#### 2. **LiveView for Real-time Updates**
```elixir
# lib/symphony_elixir_web/live/dashboard_live.ex
use Phoenix.LiveView, layout: {SymphonyElixirWeb.Layouts, :app}
```
- Dashboard mounts on `/` as a LiveView component
- Subscribes to PubSub channel for state changes
- Implements `runtime_tick` (1 second) for elapsed time formatting
- Handles both periodic updates and event-driven refreshes

#### 3. **Single LiveView Component Architecture**
```
DashboardLive
└── Renders entire dashboard in one HEEx template
    ├── Header section (hero card)
    ├── Metric cards (running count, retrying, tokens, runtime)
    ├── Rate limits section
    ├── Running sessions table (with real-time updates)
    └── Retry queue table
```

---

## 4. State Management & Data Flow

### Core State Machine: The Orchestrator
**File:** `elixir/lib/symphony_elixir/orchestrator.ex` (52KB)

**State Structure (GenServer):**
```elixir
defmodule State do
  defstruct [
    :poll_interval_ms,
    :max_concurrent_agents,
    :next_poll_due_at_ms,
    :poll_check_in_progress,
    :tick_timer_ref,
    :tick_token,
    running: %{},           # issue_id -> running_entry
    completed: MapSet.new(),
    claimed: MapSet.new(),
    retry_attempts: %{},    # issue_id -> retry_entry
    codex_totals: nil,      # cumulative token/runtime stats
    codex_rate_limits: nil  # API rate limit snapshot
  ]
end
```

### Issue Lifecycle (State Transitions)
1. **Polling**: Check tracker for active-state issues
2. **Claimed**: Mark issue as claimed to prevent race conditions
3. **Running**: Agent actively working (running GenServer spawned)
4. **Completed**: Issue moved to terminal state (Done, Closed, Cancelled, etc.)
5. **Retry Queue**: Issue still active after completion; scheduled for retry
6. **Terminal**: Issue in terminal state; workspace cleaned up

### Event Loop
```
Tick (poll_interval_ms)
  ├─ Refresh runtime config from WORKFLOW.md
  ├─ Call tracker for candidate issues
  ├─ Spawn up to max_concurrent_agents new workers
  ├─ Monitor running workers via process DOWN messages
  ├─ On completion:
  │   ├─ Record session token usage
  │   ├─ If issue still active: schedule retry (exponential backoff)
  │   └─ If issue terminal: clean workspace
  └─ Notify dashboard via PubSub
```

### State Flow to Dashboard
```
Orchestrator (GenServer)
  │
  ├─ Maintains State: running/retrying/completed
  ├─ Broadcasts: ObservabilityPubSub
  │   ├─ :observability_updated (full state)
  │   └─ Notified on poll cycles & agent transitions
  │
  ├─ Exposes via API:
  │   ├─ Presenter.state_payload()
  │   │   ├─ Counts: running, retrying
  │   │   ├─ Running entries: issue, state, session_id, tokens, events
  │   │   ├─ Retry entries: issue, attempt, due_at, error
  │   │   ├─ Codex totals: input/output/total tokens
  │   │   └─ Rate limits snapshot
  │   └─ Presenter.issue_payload(issue_id)
  │       └─ Detailed per-issue view
  │
  └─ LiveView Dashboard
      ├─ Subscribe to PubSub channel
      ├─ Poll state every 1 second (runtime_tick)
      ├─ Re-render sections that changed
      └─ Display in tables, metric cards, etc.
```

---

## 5. Frontend Components & UI Patterns

### Main Component: DashboardLive
**File:** `elixir/lib/symphony_elixir_web/live/dashboard_live.ex`

**Structure:**
```elixir
def render(assigns) do
  ~H"""
  <section class="dashboard-shell">
    <!-- Hero Card -->
    <header class="hero-card">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">Symphony Observability</p>
          <h1 class="hero-title">Operations Dashboard</h1>
          <p class="hero-copy">Current state, retry pressure, token usage...</p>
        </div>
        <div class="status-stack">
          <span class="status-badge status-badge-live">
            <span class="status-badge-dot"></span>
            Live
          </span>
        </div>
      </div>
    </header>

    <!-- Metric Grid -->
    <section class="metric-grid">
      <article class="metric-card">
        <p class="metric-label">Running</p>
        <p class="metric-value numeric"><%= @payload.counts.running %></p>
        <p class="metric-detail">Active issue sessions in the current runtime.</p>
      </article>
      <!-- 3 more metric cards: Retrying, Total tokens, Runtime -->
    </section>

    <!-- Rate Limits Section -->
    <section class="section-card">
      <h2 class="section-title">Rate limits</h2>
      <pre class="code-panel"><%= pretty_value(@payload.rate_limits) %></pre>
    </section>

    <!-- Running Sessions Table -->
    <section class="section-card">
      <h2 class="section-title">Running sessions</h2>
      <table class="data-table data-table-running">
        <thead>
          <tr>
            <th>Issue</th>
            <th>State</th>
            <th>Session</th>
            <th>Runtime / turns</th>
            <th>Codex update</th>
            <th>Tokens</th>
          </tr>
        </thead>
        <tbody>
          <tr :for={entry <- @payload.running}>
            <!-- Each running session row with live updates -->
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Retry Queue Table -->
    <section class="section-card">
      <h2 class="section-title">Retry queue</h2>
      <table class="data-table">
        <!-- Retrying issues with backoff info -->
      </table>
    </section>
  </section>
  """
end
```

### Helper Functions
- `load_payload()` - Fetches current state via Presenter
- `format_int()` - Comma-separated number formatting
- `format_runtime_seconds()` - Displays as "Nm Ss"
- `state_badge_class()` - Contextual styling for issue states
- `summarize_message()` - Truncates agent messages

### Layouts
**File:** `elixir/lib/symphony_elixir_web/components/layouts.ex`

**Root Layout:**
- Sets up HTML structure, viewport, CSRF token
- Loads Phoenix vendor scripts (phoenix.js, phoenix_live_view.js, phoenix_html.js)
- Initializes LiveSocket on DOMContentLoaded
- Links to dashboard.css

**App Layout:**
- Wraps main content in `<main class="app-shell">`

---

## 6. API Endpoints & Data Models

### Routes
**File:** `elixir/lib/symphony_elixir_web/router.ex`

```elixir
# LiveView Dashboard
live("/", DashboardLive, :index)

# JSON API
get("/api/v1/state", ObservabilityApiController, :state)
post("/api/v1/refresh", ObservabilityApiController, :refresh)
get("/api/v1/:issue_identifier", ObservabilityApiController, :issue)

# Static assets
get("/dashboard.css", StaticAssetController, :dashboard_css)
get("/vendor/phoenix_html/phoenix_html.js", StaticAssetController, :phoenix_html_js)
get("/vendor/phoenix/phoenix.js", StaticAssetController, :phoenix_js)
get("/vendor/phoenix_live_view/phoenix_live_view.js", StaticAssetController, :phoenix_live_view_js)
```

### Presenter Data Models
**File:** `elixir/lib/symphony_elixir_web/presenter.ex`

**State Payload (returned by `/api/v1/state`):**
```elixir
%{
  generated_at: "2026-03-18T12:34:56Z",
  counts: %{running: 3, retrying: 1},
  running: [
    %{
      issue_id: "LEG-123",
      issue_identifier: "LEG-123",
      state: "in_progress",
      worker_host: "127.0.0.1",
      workspace_path: "/home/user/workspaces/LEG-123",
      session_id: "sess_abc123",
      turn_count: 5,
      last_event: "codex_message",
      last_message: "Completed implementation...",
      started_at: "2026-03-18T12:00:00Z",
      last_event_at: "2026-03-18T12:34:00Z",
      tokens: %{
        input_tokens: 50000,
        output_tokens: 30000,
        total_tokens: 80000
      }
    }
  ],
  retrying: [
    %{
      issue_id: "LEG-124",
      issue_identifier: "LEG-124",
      attempt: 2,
      due_at: "2026-03-18T12:35:30Z",
      error: "Connection timeout",
      worker_host: nil,
      workspace_path: "/home/user/workspaces/LEG-124"
    }
  ],
  codex_totals: %{
    input_tokens: 500000,
    output_tokens: 300000,
    total_tokens: 800000,
    seconds_running: 3600
  },
  rate_limits: %{...}  # API rate limit snapshot
}
```

**Issue Payload (returned by `/api/v1/:issue_identifier`):**
```elixir
%{
  issue_identifier: "LEG-123",
  issue_id: "db_id_123",
  status: "running",
  workspace: %{
    path: "/home/user/workspaces/LEG-123",
    host: "127.0.0.1"
  },
  attempts: %{
    restart_count: 1,
    current_retry_attempt: 2
  },
  running: %{
    worker_host: "127.0.0.1",
    workspace_path: "/home/user/workspaces/LEG-123",
    session_id: "sess_abc123",
    turn_count: 5,
    state: "in_progress",
    started_at: "2026-03-18T12:00:00Z",
    last_event: "codex_message",
    last_message: "Implementation done",
    last_event_at: "2026-03-18T12:34:00Z",
    tokens: %{...}
  },
  retry: nil,
  logs: %{codex_session_logs: []},
  recent_events: [...],
  last_error: nil,
  tracked: %{}
}
```

---

## 7. Styling & Design System

**File:** `elixir/priv/static/dashboard.css` (8KB)

### Color Palette (CSS Variables)
```css
:root {
  --page: #f7f7f8;           /* Background */
  --page-soft: #fbfbfc;      /* Soft background */
  --page-deep: #ececf1;      /* Deep background */
  --card: rgba(255, 255, 255, 0.94);  /* Card background */
  --card-muted: #f3f4f6;     /* Muted card */
  --ink: #202123;            /* Text color */
  --muted: #6e6e80;          /* Muted text */
  --line: #ececf1;           /* Borders */
  --line-strong: #d9d9e3;    /* Strong borders */
  --accent: #10a37f;         /* Primary accent (teal) */
  --accent-ink: #0f513f;     /* Accent text */
  --accent-soft: #e8faf4;    /* Soft accent background */
  --danger: #b42318;         /* Danger/error red */
  --danger-soft: #fef3f2;    /* Soft danger background */
  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.05);
  --shadow-lg: 0 20px 50px rgba(15, 23, 42, 0.08);
}
```

### Component Classes
- `.dashboard-shell` - Main container
- `.hero-card` - Header section
- `.metric-grid` / `.metric-card` - KPI cards
- `.section-card` - Grouped content sections
- `.data-table` - Data tables with columns
- `.state-badge` - Status indicators (active/danger/warning)
- `.subtle-button` - Secondary button style (for copy ID)

### Typography
- Font family: "Sohne", "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif
- Line height: 1.5
- Responsive: Single-column layout (no media queries in current CSS)

---

## 8. Build & Development Setup

### Dependencies (mix.exs)
```elixir
{:phoenix, "~> 1.8.0"},
{:phoenix_live_view, "~> 1.1.0"},
{:bandit, "~> 1.8"},           # HTTP server
{:req, "~> 0.5"},              # HTTP client
{:jason, "~> 1.4"},            # JSON encoding
{:yaml_elixir, "~> 2.12"},     # YAML parsing
{:solid, "~> 1.2"},            # Liquid templates
{:ecto, "~> 3.13"},            # Data validation
{:phoenix_html, "~> 4.2"},
{:floki, ">= 0.30.0", only: :test},  # HTML parsing
{:credo, "~> 1.7", only: [:dev, :test]},  # Linting
{:dialyxir, "~> 1.4", only: [:dev]}       # Type checking
```

### Build Process
```bash
cd elixir
mise trust
mise install          # Install Erlang/Elixir via mise
mix setup             # Get dependencies
mix build             # Creates bin/symphony executable
mix lint              # specs.check + credo
make all              # Format + lint + coverage + dialyzer
```

### Run Commands
```bash
./bin/symphony ./WORKFLOW.md              # Production run
./bin/symphony --port 4000 ./WORKFLOW.md  # Start with dashboard on port 4000
```

### Dashboard Access
- When `--port` is specified, dashboard runs at `http://localhost:4000`
- LiveView connected at `/`
- JSON API at `/api/v1/*`

---

## 9. Configuration & Extensibility

### WORKFLOW.md Configuration
**File:** `elixir/WORKFLOW.md`

**YAML Front Matter:**
```yaml
tracker:
  kind: linear              # linear, jira, memory
  project_slug: "..."
  active_states: [Todo, In Progress, Merging, Rework]
  terminal_states: [Closed, Cancelled, Duplicate, Done]

polling:
  interval_ms: 5000         # Poll every 5 seconds

workspace:
  root: ~/code/symphony-workspaces

hooks:
  after_create: |           # Setup script when workspace created
    git clone --depth 1 https://github.com/openai/symphony .
    cd elixir && mise trust && mise exec -- mix deps.get
  before_remove: |          # Cleanup script before workspace removal
    cd elixir && mise exec -- mix workspace.before_remove

agent:
  max_concurrent_agents: 10 # Parallel workers
  max_turns: 20             # Max turns per invocation

codex:
  command: "codex app-server"
  approval_policy: never    # or on-failure, on-request, untrusted
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
```

### Tracker Implementations
1. **Linear** - GraphQL API client (primary)
2. **Jira** - REST API client (PoC)
3. **Memory** - In-memory for testing

### Platform Support
- **Local workers:** Codex running on same machine
- **SSH workers:** Codex running on remote SSH hosts (load balancing)
- **Docker workers:** SSH-based workers in Docker containers

---

## 10. Key Architectural Patterns

### 1. GenServer Pattern for Orchestration
- **Module:** `SymphonyElixir.Orchestrator`
- **State:** Concurrent issue tracking, retry queue, token accounting
- **Concurrency:** Handles up to `max_concurrent_agents` issues in parallel
- **Reliability:** Process monitoring via `monitor/2`, recovery on worker crashes

### 2. PubSub for Real-time Dashboard Updates
```elixir
# Broadcast state changes
Phoenix.PubSub.broadcast(
  SymphonyElixir.PubSub,
  "observability",
  :observability_updated
)

# Dashboard subscribes
:ok = ObservabilityPubSub.subscribe()

# LiveView receives and re-renders
def handle_info(:observability_updated, socket) do
  {:noreply, socket |> assign(:payload, load_payload())}
end
```

### 3. LiveView for Reactive UI
- No JavaScript framework overhead
- Server-side rendering of initial HTML
- WebSocket for bidirectional updates
- Automatic re-rendering on state changes
- Built-in CSRF protection

### 4. Separation of Concerns
- **Core Logic:** Orchestrator (polling, dispatch, lifecycle)
- **API Layer:** Presenter (data transformation)
- **Web Layer:** LiveView + Controllers (HTTP/WebSocket)
- **Config Layer:** Workflow parser + Config module

### 5. Workspace Isolation
- Per-issue directories under configurable root
- Safety checks prevent path traversal
- SSH workers support for distributed execution
- Cleanup hooks on completion

---

## 11. Project Conventions & Standards

### Code Quality Requirements (AGENTS.md)
```
- All public functions (def) must have @spec
- defp specs are optional
- Coverage threshold: 100% (excluding infrastructure modules)
- Quality gates: format check, credo lint, dialyzer, coverage
```

### Testing Strategy
- Unit tests in `test/`
- Snapshot tests for dashboard output
- Live E2E tests with real Linear/SSH
- Isolation: each test gets fresh state

### Documentation Policy
- Update `AGENTS.md` for codebase conventions
- Update `README.md` for run instructions
- Update `WORKFLOW.md` for config changes
- Keep `../SPEC.md` aligned with implementation

### PR Requirements
- PR body must follow `../.github/pull_request_template.md`
- Validate with `mix pr_body.check`
- Coverage must remain at 100%
- All tests must pass

---

## 12. Quick Reference File Paths

### Critical Frontend Files
- **Dashboard Component:** `elixir/lib/symphony_elixir_web/live/dashboard_live.ex`
- **Router:** `elixir/lib/symphony_elixir_web/router.ex`
- **Presenter (API Models):** `elixir/lib/symphony_elixir_web/presenter.ex`
- **Layouts:** `elixir/lib/symphony_elixir_web/components/layouts.ex`
- **CSS:** `elixir/priv/static/dashboard.css`

### Core Orchestration
- **Orchestrator:** `elixir/lib/symphony_elixir/orchestrator.ex`
- **Application Entry:** `elixir/lib/symphony_elixir.ex`
- **HTTP Server:** `elixir/lib/symphony_elixir/http_server.ex`

### Configuration & Workflows
- **Config Loader:** `elixir/lib/symphony_elixir/config.ex`
- **Workflow Parser:** `elixir/lib/symphony_elixir/workflow.ex`
- **WORKFLOW.md (Contract):** `elixir/WORKFLOW.md`

### Project Documentation
- **AGENTS.md (Conventions):** `elixir/AGENTS.md`
- **README (Elixir):** `elixir/README.md`
- **SPEC.md (Language-agnostic):** `SPEC.md`

---

## 13. Key Decisions & Architectural Trade-offs

### 1. Why Elixir?
- Built on Erlang/BEAM/OTP for supervisor patterns
- Natural fit for long-running orchestration processes
- Hot code reloading without stopping agents
- Strong concurrency primitives (GenServer, PubSub, monitors)
- Active ecosystem (Phoenix, Ecto, etc.)

### 2. Why Phoenix LiveView (not React/Vue)?
- Single language for server and frontend logic
- Real-time updates via WebSocket without custom protocol
- Server-side rendering eliminates SPA complexity
- Smaller bundle size (Phoenix client + CSS only)
- Rapid iteration on data-driven UI

### 3. Single LiveView Component
- Current dashboard fits in one view (~330 lines)
- Real-time updates broadcast to all subscribers
- No state sync issues between components
- Simple mental model for observability

### 4. Workspace Isolation Strategy
- Per-issue directories prevent agent interference
- SSH workers enable distributed execution
- Hooks allow custom setup/cleanup per workspace
- Path safety validation prevents escapes

---

## 14. Understanding the Flow

1. **Orchestrator** (GenServer) polls the tracker every `poll_interval_ms`
2. **Spawns agents** in isolated workspaces (up to `max_concurrent_agents`)
3. **Monitors** each agent process; broadcasts state changes via PubSub
4. **Dashboard** (LiveView) subscribes to changes and re-renders tables/metrics
5. **API** (JSON endpoints) provides programmatic access to state

### Key Concepts
- **Issue Lifecycle:** Pending → Claimed → Running → Completed → Retry/Terminal
- **State Persistence:** GenServer state (not database)
- **Real-time Updates:** PubSub broadcast → LiveView re-render
- **Workspace Safety:** All work confined to `workspace.root/<issue_id>/`
- **Retry Logic:** Exponential backoff on failure; continuation retries if issue still active

### Frontend Extension Points
1. Add new metric card to dashboard (edit `dashboard_live.ex` render)
2. Add new API endpoint (add route to `router.ex`, handler to `observability_api_controller.ex`)
3. Add new presenter transformation (edit `presenter.ex`)
4. Customize styling (edit `dashboard.css`)
5. Add new table section (edit `dashboard_live.ex` render)

### Development Workflow
```bash
# Setup
cd elixir
mise trust && mise install
mix setup

# Run locally (no dashboard)
./bin/symphony ./WORKFLOW.md

# Run with dashboard on port 4000
./bin/symphony --port 4000 ./WORKFLOW.md

# Tests
make all

# Individual checks
mix format --check-formatted
mix credo --strict
mix test --cover
mix dialyzer
```

---

**End of Architecture Analysis**

# Symphony Frontend Quick Reference Guide

## Overview

Symphony's frontend is a **Phoenix LiveView dashboard** with zero JavaScript frameworks. It's built for observability: displaying real-time orchestration state, retry queues, token usage, and agent activity.

**Architecture:** Server-side rendering (HEEx) + WebSocket updates (PubSub) + minimal client JavaScript

---

## Key Files

### Main Dashboard Component
- **File:** `elixir/lib/symphony_elixir_web/live/dashboard_live.ex` (330 lines)
- **Pattern:** Phoenix LiveView component
- **Responsibility:** Render entire dashboard, handle real-time updates
- **Key Methods:**
  - `mount/3` - Subscribe to PubSub, load initial payload
  - `handle_info/2` - Handle PubSub events and runtime ticks
  - `render/1` - Generate HEEx template

### State & Data

**Orchestrator (core state):**
- File: `elixir/lib/symphony_elixir/orchestrator.ex`
- Maintains: GenServer state with running/retrying issues
- Broadcasting: PubSub `:observability_updated` events
- Responsibility: Poll tracker, spawn workers, track execution

**Presenter (API models):**
- File: `elixir/lib/symphony_elixir_web/presenter.ex`
- Transforms GenServer state → JSON/Map for API/Dashboard
- Exposes: `state_payload/2` and `issue_payload/3`

### Routing & HTTP

**Router:**
- File: `elixir/lib/symphony_elixir_web/router.ex`
- LiveView route: `live("/", DashboardLive, :index)`
- API routes: `/api/v1/state`, `/api/v1/:issue_identifier`, `/api/v1/refresh`
- Static: `/dashboard.css`, vendor assets

**Controllers:**
- `observability_api_controller.ex` - JSON API endpoints
- `static_asset_controller.ex` - Serve CSS/JS

### Styling

**CSS:**
- File: `elixir/priv/static/dashboard.css` (8KB)
- Approach: Hand-written, no build step
- Variables: Color palette in `:root`
- Classes: `.dashboard-shell`, `.metric-card`, `.data-table`, `.state-badge`

### Layouts

**Root Layout:**
- File: `elixir/lib/symphony_elixir_web/components/layouts.ex`
- HTML boilerplate, CSRF token, Phoenix scripts
- Initializes LiveSocket on DOMContentLoaded

**App Layout:**
- Wraps content in `<main class="app-shell">`

---

## Data Flow

```
Orchestrator (GenServer)
    ↓
PubSub.broadcast(:observability_updated)
    ↓
DashboardLive.handle_info(:observability_updated, socket)
    ↓
Presenter.state_payload() → transforms state
    ↓
assign(:payload, payload) → re-render template
    ↓
Browser sees updated HTML
```

---

## Dashboard Layout

```html
<section class="dashboard-shell">
  <!-- 1. Hero Header -->
  <header class="hero-card">
    <h1>Operations Dashboard</h1>
    <span class="status-badge">Live</span>
  </header>

  <!-- 2. Metric Cards -->
  <section class="metric-grid">
    <article class="metric-card">Running: 3</article>
    <article class="metric-card">Retrying: 1</article>
    <article class="metric-card">Total tokens: 500K</article>
    <article class="metric-card">Runtime: 1h 23m</article>
  </section>

  <!-- 3. Rate Limits -->
  <section class="section-card">
    <h2>Rate limits</h2>
    <pre class="code-panel">{...}</pre>
  </section>

  <!-- 4. Running Sessions Table -->
  <section class="section-card">
    <h2>Running sessions</h2>
    <table class="data-table">
      <!-- Rows for each running issue -->
    </table>
  </section>

  <!-- 5. Retry Queue Table -->
  <section class="section-card">
    <h2>Retry queue</h2>
    <table class="data-table">
      <!-- Rows for each retrying issue -->
    </table>
  </section>
</section>
```

---

## Adding Features

### 1. Add a New Metric Card

**File:** `elixir/lib/symphony_elixir_web/live/dashboard_live.ex`

Find the metric grid section in `render/1`:

```elixir
<section class="metric-grid">
  <article class="metric-card">
    <p class="metric-label">New Metric</p>
    <p class="metric-value numeric"><%= @payload.new_value %></p>
    <p class="metric-detail">Description of the metric.</p>
  </article>
  <!-- existing cards -->
</section>
```

Then ensure the presenter provides the data in `Presenter.state_payload/2`:

```elixir
%{
  # ... existing fields
  new_value: value_from_orchestrator_state
}
```

### 2. Add a New Table Section

**File:** `elixir/lib/symphony_elixir_web/live/dashboard_live.ex`

Add after the retry queue table:

```elixir
<section class="section-card">
  <div class="section-header">
    <h2 class="section-title">New Table</h2>
    <p class="section-copy">Description of what this shows.</p>
  </div>

  <%= if @payload.new_items == [] do %>
    <p class="empty-state">No items to display.</p>
  <% else %>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Column 1</th>
            <th>Column 2</th>
          </tr>
        </thead>
        <tbody>
          <tr :for={item <- @payload.new_items}>
            <td><%= item.field1 %></td>
            <td><%= item.field2 %></td>
          </tr>
        </tbody>
      </table>
    </div>
  <% end %>
</section>
```

### 3. Add a New API Endpoint

**Step 1: Add Route**
File: `elixir/lib/symphony_elixir_web/router.ex`

```elixir
scope "/", SymphonyElixirWeb do
  get("/api/v1/new-endpoint", ObservabilityApiController, :new_endpoint)
end
```

**Step 2: Add Controller Handler**
File: `elixir/lib/symphony_elixir_web/controllers/observability_api_controller.ex`

```elixir
def new_endpoint(conn, _params) do
  payload = Presenter.new_endpoint_payload(...)
  json(conn, payload)
end
```

**Step 3: Add Presenter Method**
File: `elixir/lib/symphony_elixir_web/presenter.ex`

```elixir
def new_endpoint_payload(...) do
  %{
    # structure your response
  }
end
```

### 4. Update Styling

**File:** `elixir/priv/static/dashboard.css`

Uses CSS variables for colors:

```css
.my-new-element {
  background: var(--card);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 1rem;
}

.my-danger-element {
  background: var(--danger-soft);
  color: var(--danger);
}
```

Available variables:
- `--page`, `--page-soft`, `--page-deep` - Backgrounds
- `--card`, `--card-muted` - Card backgrounds
- `--ink`, `--muted` - Text colors
- `--line`, `--line-strong` - Borders
- `--accent`, `--accent-ink`, `--accent-soft` - Accent
- `--danger`, `--danger-soft` - Danger/error
- `--shadow-sm`, `--shadow-lg` - Shadows

### 5. Add Real-time Updates

Real-time happens automatically via PubSub. When Orchestrator broadcasts `:observability_updated`:

```elixir
def handle_info(:observability_updated, socket) do
  {:noreply,
   socket
   |> assign(:payload, load_payload())
   |> assign(:now, DateTime.utc_now())}
end
```

To subscribe to updates in a new LiveView component, add:

```elixir
def mount(_params, _session, socket) do
  if connected?(socket) do
    :ok = ObservabilityPubSub.subscribe()
  end
  {:ok, socket}
end

def handle_info(:observability_updated, socket) do
  # Your update logic
  {:noreply, socket}
end
```

---

## Testing

### Snapshot Tests

Snapshots live in `test/fixtures/status_dashboard_snapshots/`. They're YAML files showing expected dashboard state under different conditions:

- `idle.evidence.md` - No running agents
- `running.evidence.md` - Multiple agents running
- `backoff_queue.evidence.md` - Issues in retry queue
- `super_busy.evidence.md` - High concurrent load

Run tests:

```bash
cd elixir
mix test test/symphony_elixir_web/
```

### Manual Testing

```bash
# Build and run with dashboard
cd elixir
mix build
./bin/symphony --port 4000 ./WORKFLOW.md
# Open http://localhost:4000
```

---

## State Structure Reference

### Payload (returned by Presenter.state_payload)

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
      workspace_path: "/workspaces/LEG-123",
      session_id: "sess_abc",
      turn_count: 5,
      last_event: "codex_message",
      last_message: "Completed implementation",
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
      workspace_path: "/workspaces/LEG-124"
    }
  ],
  codex_totals: %{
    input_tokens: 500000,
    output_tokens: 300000,
    total_tokens: 800000,
    seconds_running: 3600
  },
  rate_limits: %{...}
}
```

---

## Helper Functions

**In DashboardLive:**

- `format_int(n)` - Comma-separated: 50000 → "50,000"
- `format_runtime_seconds(s)` - Duration: 3661 → "1m 1s"
- `state_badge_class(state)` - CSS class for state styling
- `pretty_value(val)` - Pretty-print for debugging

---

## CSS Classes Reference

### Layout
- `.dashboard-shell` - Main container
- `.app-shell` - App wrapper
- `.hero-card` - Header card
- `.hero-grid` - Header grid layout
- `.hero-title` - Large heading
- `.hero-copy` - Subtitle text

### Metrics
- `.metric-grid` - Grid of metric cards
- `.metric-card` - Individual metric card
- `.metric-label` - Metric title
- `.metric-value` - Metric number
- `.metric-detail` - Metric description

### Tables
- `.section-card` - Container for section
- `.section-header` - Section title area
- `.section-title` - Section heading
- `.section-copy` - Section description
- `.data-table` - Table element
- `.table-wrap` - Table scroll wrapper

### Status
- `.status-badge` - Status indicator
- `.status-badge-live` - Green/active state
- `.status-badge-offline` - Gray/inactive state
- `.status-badge-dot` - Small dot indicator
- `.state-badge` - Issue state badge
- `.state-badge-active` - Active state (green)
- `.state-badge-danger` - Error/blocked (red)
- `.state-badge-warning` - Warning/retry (yellow)

### Other
- `.subtle-button` - Secondary button (copy ID)
- `.empty-state` - Empty list message
- `.code-panel` - Code/JSON display
- `.issue-stack` - Issue ID + link layout
- `.token-stack` - Token display layout
- `.detail-stack` - Multi-line detail layout

---

## Development Workflow

```bash
# Setup
cd elixir
mise trust && mise install
mix setup

# During development
mix test --watch          # Watch mode testing
iex -S mix phx.server     # Interactive server (if you need REPL)

# Quality checks
make all                  # Full quality gate
mix format --check-formatted
mix credo --strict
mix test --cover
mix dialyzer

# Build & run
mix build
./bin/symphony --port 4000 ./WORKFLOW.md
```

---

## Common Patterns

### Real-time Update Pattern

```elixir
# In mount: subscribe
:ok = ObservabilityPubSub.subscribe()

# In handle_info: re-render
def handle_info(:observability_updated, socket) do
  {:noreply, assign(socket, :payload, load_payload())}
end
```

### Conditional Rendering

```elixir
<%= if empty?(@payload.items) do %>
  <p class="empty-state">Nothing to display</p>
<% else %>
  <!-- Content -->
<% end %>
```

### Formatting Numbers

```elixir
<p class="metric-value numeric"><%= format_int(@payload.count) %></p>
```

### Table Iteration

```elixir
<tbody>
  <tr :for={item <- @payload.items}>
    <td><%= item.field %></td>
  </tr>
</tbody>
```

---

## Troubleshooting

### Dashboard Not Updating

1. Check WebSocket connection (F12 → Network → ws://)
2. Verify `ObservabilityPubSub.subscribe()` is called in `mount`
3. Check `handle_info(:observability_updated, ...)` is implemented
4. Verify `:observability_updated` is being broadcast from Orchestrator

### Styling Not Applied

1. Clear browser cache (Cmd+Shift+R)
2. Restart Phoenix server
3. Verify CSS class names in template match CSS file

### Data Not Showing

1. Check Presenter returns expected fields
2. Verify `assign(:payload, ...)` in mount/handle_info
3. Inspect JSON API (`/api/v1/state`) to see raw data
4. Check for nil values in Presenter methods

---

## Resources

- **ARCHITECTURE.md** - Detailed architecture and patterns
- **elixir/AGENTS.md** - Code quality requirements
- **elixir/README.md** - Setup and run instructions
- **SPEC.md** - Language-agnostic specification
- Phoenix Docs: https://hexdocs.pm/phoenix/Phoenix.LiveView.html
- HEEx Docs: https://hexdocs.pm/phoenix_live_view/Phoenix.Component.html#sigil_H/2

---

**Last Updated:** March 18, 2026

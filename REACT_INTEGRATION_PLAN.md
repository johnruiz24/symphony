# React Frontend Integration Analysis for Symphony

**Date:** March 18, 2026
**Purpose:** Comprehensive analysis for replacing/integrating React frontend
**Current Status:** Phoenix LiveView (server-rendered, zero JS framework)

---

## Executive Summary

Symphony's current frontend is **Phoenix LiveView with zero JavaScript frameworks**. The backend exposes a stable JSON API via three endpoints. A React integration could either:

1. **Replace LiveView completely** (full SPA)
2. **Run in parallel** (side-by-side with LiveView)
3. **Enhance LiveView** (Alpine.js/htmx for richer UX)

This document focuses on **Option 1** (full replacement) as it gives maximum flexibility for modern React patterns, mobile support, and richer interactivity.

---

## Part 1: Current Architecture

### 1.1 Project Structure (Essential Files Only)

```
elixir/
├── lib/
│   ├── symphony_elixir_web/
│   │   ├── router.ex                     # Routes: defines /api/v1/* endpoints
│   │   ├── controllers/
│   │   │   └── observability_api_controller.ex  # API implementation (80 lines)
│   │   ├── live/
│   │   │   └── dashboard_live.ex         # Current LiveView (330 lines) - REPLACE
│   │   ├── presenter.ex                  # Data transformation (CRITICAL - study this)
│   │   └── components/
│   │       └── layouts.ex                # HTML layouts
│   │
│   ├── symphony_elixir/
│   │   ├── orchestrator.ex               # Core state machine (52KB GenServer)
│   │   └── http_server.ex                # HTTP server startup
│   │
│   └── symphony_elixir_web/
│       └── observability_pubsub.ex       # PubSub setup
│
├── priv/
│   └── static/
│       └── dashboard.css                 # CSS (8KB) - can be replaced/extended
│
├── config/
│   └── config.exs                        # Phoenix config
│
├── mix.exs                               # Dependencies
└── AGENTS.md                             # Code conventions
```

### 1.2 Current Frontend Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Server** | Phoenix 1.8 + LiveView 1.1 | HTML rendering + real-time updates |
| **HTTP** | Bandit | Modern Erlang HTTP server |
| **Protocol** | WebSocket + PubSub | Real-time bidirectional communication |
| **Rendering** | HEEx (server-side) | Template rendering |
| **CSS** | Vanilla CSS (8KB) | Single file, no preprocessor |
| **JS** | Phoenix client lib (~15KB) | WebSocket + DOM operations |
| **Database** | None | All state in-memory |

### 1.3 Key Design Decisions

**Why no JavaScript framework?**
- Symphony is a **monitoring/observability dashboard**
- Real-time updates via PubSub (Erlang, not polling)
- Server-side rendering minimizes client complexity
- Single LiveView component (all UI in one place)

**Why Phoenix LiveView?**
- Single language for server + frontend logic
- Real-time updates without custom protocol
- CSRF protection built-in
- Rapid iteration on data-driven UI

---

## Part 2: API Contract (THE CRITICAL PIECE)

### 2.1 Endpoints Summary

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| GET | `/api/v1/state` | Full orchestration state | JSON (see below) |
| GET | `/api/v1/:issue_id` | Per-issue detail | JSON (see below) |
| POST | `/api/v1/refresh` | Trigger poll cycle | 202 Accepted |
| GET | `/dashboard.css` | Dashboard styling | CSS file |
| GET | `/vendor/phoenix.js` | Phoenix client lib | JS file |

**Note:** The vendor JS files are for LiveView protocol. If building React SPA, you can ignore these.

### 2.2 GET /api/v1/state (Full State)

**File:** `/elixir/lib/symphony_elixir_web/presenter.ex`

**Response Shape:**
```json
{
  "generated_at": "2026-03-18T12:34:56Z",
  "counts": {
    "running": 3,
    "retrying": 1
  },
  "running": [
    {
      "issue_id": "db_id_123",
      "issue_identifier": "LEG-123",
      "state": "in_progress",
      "worker_host": "127.0.0.1",
      "workspace_path": "/home/user/workspaces/LEG-123",
      "session_id": "sess_abc123",
      "turn_count": 5,
      "last_event": "codex_message",
      "last_message": "Completed implementation...",
      "started_at": "2026-03-18T12:00:00Z",
      "last_event_at": "2026-03-18T12:34:00Z",
      "tokens": {
        "input_tokens": 50000,
        "output_tokens": 30000,
        "total_tokens": 80000
      }
    }
  ],
  "retrying": [
    {
      "issue_id": "db_id_124",
      "issue_identifier": "LEG-124",
      "attempt": 2,
      "due_at": "2026-03-18T12:35:30Z",
      "error": "Connection timeout",
      "worker_host": null,
      "workspace_path": "/home/user/workspaces/LEG-124"
    }
  ],
  "codex_totals": {
    "input_tokens": 500000,
    "output_tokens": 300000,
    "total_tokens": 800000,
    "seconds_running": 3600
  },
  "rate_limits": {
    "model": "gpt-4",
    "requests_per_minute": 100,
    "tokens_per_minute": 1000000
  }
}
```

**Error Response (on timeout):**
```json
{
  "generated_at": "2026-03-18T12:34:56Z",
  "error": {
    "code": "snapshot_timeout",
    "message": "Snapshot timed out"
  }
}
```

### 2.3 GET /api/v1/:issue_identifier (Per-Issue Detail)

**Response Shape:**
```json
{
  "issue_identifier": "LEG-123",
  "issue_id": "db_id_123",
  "status": "running",
  "workspace": {
    "path": "/home/user/workspaces/LEG-123",
    "host": "127.0.0.1"
  },
  "attempts": {
    "restart_count": 1,
    "current_retry_attempt": 2
  },
  "running": {
    "worker_host": "127.0.0.1",
    "workspace_path": "/home/user/workspaces/LEG-123",
    "session_id": "sess_abc123",
    "turn_count": 5,
    "state": "in_progress",
    "started_at": "2026-03-18T12:00:00Z",
    "last_event": "codex_message",
    "last_message": "Implementation done",
    "last_event_at": "2026-03-18T12:34:00Z",
    "tokens": { /* same as above */ }
  },
  "retry": null,
  "logs": {
    "codex_session_logs": []
  },
  "recent_events": [ /* future expansion */ ],
  "last_error": null,
  "tracked": {}
}
```

**Error Response:**
```json
{
  "error": {
    "code": "issue_not_found",
    "message": "Issue not found"
  }
}
```

### 2.4 POST /api/v1/refresh (Trigger Poll)

**Request:** Empty body

**Response (202 Accepted):**
```json
{
  "requested_at": "2026-03-18T12:34:56Z",
  "status": "scheduled"
}
```

---

## Part 3: Real-time Updates (WebSocket)

### 3.1 Phoenix PubSub Integration

**Current Implementation:**
```elixir
# Dashboard subscribes on mount
ObservabilityPubSub.subscribe()

# Orchestrator broadcasts on state change
Phoenix.PubSub.broadcast(
  SymphonyElixir.PubSub,
  "observability",
  :observability_updated
)

# LiveView receives and re-renders
def handle_info(:observability_updated, socket) do
  {:noreply, socket |> assign(:payload, load_payload())}
end
```

**For React SPA:**

Option A: Keep Phoenix WebSocket protocol
- Requires Phoenix client library (~15KB)
- Use existing `"observability"` channel
- React hook listens to events and triggers re-fetch

Option B: Implement Server-Sent Events (SSE)
- Simpler protocol (one-way, HTTP-based)
- No WebSocket complexity
- Add new endpoint: `GET /api/v1/events`
- React app subscribes via EventSource

Option C: Pure polling
- No WebSocket or SSE required
- React polls `/api/v1/state` every N seconds
- Simpler but less efficient

**Recommendation:** Option B (SSE) is simplest for React with minimal Elixir changes.

---

## Part 4: Current Frontend (What to Replace)

### 4.1 Dashboard Sections

**File:** `/elixir/lib/symphony_elixir_web/live/dashboard_live.ex` (330 lines)

**Current Sections:**

1. **Hero Card**
   - Title: "Symphony Observability"
   - Subtitle: "Operations Dashboard"
   - Status badge: "Live" or "Offline"

2. **Metric Grid** (4 cards)
   - Running count + description
   - Retrying count + description
   - Total tokens + input/output breakdown
   - Runtime (elapsed time)

3. **Rate Limits Section**
   - Pre-formatted code panel with rate limit snapshot

4. **Running Sessions Table**
   - Columns: Issue ID, State, Session ID, Runtime/Turns, Codex Update, Tokens
   - Live updates on PubSub broadcast
   - Clickable issue links

5. **Retry Queue Table**
   - Columns: Issue ID, Attempt, Due At, Error Message
   - Shows backoff scheduling

### 4.2 CSS Design System

**File:** `/elixir/priv/static/dashboard.css` (8KB)

**Color Palette (CSS Variables):**
```css
--page: #f7f7f8;           /* Background */
--page-soft: #fbfbfc;      /* Soft background */
--page-deep: #ececf1;      /* Deep background */
--card: rgba(255, 255, 255, 0.94);
--card-muted: #f3f4f6;
--ink: #202123;            /* Main text */
--muted: #6e6e80;          /* Secondary text */
--line: #ececf1;           /* Borders */
--line-strong: #d9d9e3;    /* Strong borders */
--accent: #10a37f;         /* Primary (teal) */
--accent-ink: #0f513f;
--accent-soft: #e8faf4;
--danger: #b42318;         /* Error red */
--danger-soft: #fef3f2;
--shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.05);
--shadow-lg: 0 20px 50px rgba(15, 23, 42, 0.08);
```

**Typography:**
- Font: "Sohne", "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif
- Line height: 1.5
- Single-column responsive layout (no media queries)

---

## Part 5: State Machine Deep Dive

### 5.1 Orchestrator GenServer

**File:** `/elixir/lib/symphony_elixir/orchestrator.ex` (52KB)

**State Structure:**
```elixir
%{
  poll_interval_ms: 5000,
  max_concurrent_agents: 10,
  next_poll_due_at_ms: timestamp,
  poll_check_in_progress: boolean,
  tick_timer_ref: reference,
  tick_token: term,
  running: %{},           # issue_id → running_entry
  completed: MapSet,      # issue_id set
  claimed: MapSet,        # issue_id set (prevents race)
  retry_attempts: %{},    # issue_id → retry_entry
  codex_totals: %{...},   # cumulative tokens
  codex_rate_limits: %{...}
}
```

### 5.2 Issue Lifecycle

```
Polling Cycle (every 5 seconds)
  ↓
Tracker Query (Linear/Jira/Memory)
  ↓
Issue Found in Active State
  ↓
Claim Issue (mark reserved)
  ↓
Spawn Agent (add to "running")
  ↓
Agent Works...
  ↓
Agent Completes or Fails
  ↓
Check Issue State
  ├─ If Terminal (Done/Closed):
  │   └─ Clean up workspace, move to "completed"
  │
  └─ If Still Active:
      └─ Schedule Retry (exponential backoff)
          └─ Add to "retry_attempts" with due_at time
```

### 5.3 Update Triggers

**When does PubSub broadcast `:observability_updated`?**

1. Polling cycle completes (every `poll_interval_ms`)
2. Agent starts
3. Agent completes
4. Agent fails and retry scheduled
5. Workspace cleaned up

**What should React do on update?**

1. Re-fetch `/api/v1/state`
2. Diff old vs new (for optimizations)
3. Update relevant component state
4. Re-render affected sections

---

## Part 6: Integration Strategies

### 6.1 Strategy A: Full SPA Replacement (Recommended)

**Architecture:**
```
User's Browser
  ↓
React SPA (build output in priv/static/)
  ↓
Phoenix Endpoint (Bandit HTTP server)
  ├─ Serves React bundle (index.html, main.js, etc.)
  ├─ Handles /api/v1/* routes
  └─ Handles /api/v1/events (new SSE endpoint)
  ↓
Orchestrator (GenServer)
  ├─ Maintains state
  └─ Broadcasts via PubSub
```

**Steps:**
1. Keep current `router.ex` and API endpoints
2. Modify `router.ex` to serve React SPA on `/` (fallback to index.html)
3. Add SSE endpoint for real-time updates (optional)
4. Create `elixir/assets/` for React project
5. Build React to `elixir/priv/static/`
6. Remove `dashboard_live.ex` and related LiveView code

**Timeline:** 1-2 weeks (depends on feature parity desired)

### 6.2 Strategy B: Parallel Dashboard

**Architecture:**
```
User visits /             → React SPA
User visits /dashboard    → Phoenix LiveView (current)
```

**Steps:**
1. Create `elixir/assets/` for React
2. Add new route in `router.ex`: `get("/react-dashboard", SPA, :index)`
3. React app fetches from `/api/v1/state`
4. Keep LiveView dashboard as fallback

**Timeline:** 1 week (lower risk, but doubles maintenance)

### 6.3 Strategy C: Enhance LiveView

**Architecture:**
```
Keep Phoenix LiveView
Add Alpine.js or htmx for client interactivity
```

**Examples:**
- Alpine.js for time formatting on client (reduce server re-renders)
- htmx for partial component updates
- TailwindCSS for richer styling

**Timeline:** 3-5 days (minimal changes)

---

## Part 7: React Frontend Structure (Proposed)

### 7.1 Directory Layout

```
elixir/
├── assets/                             # NEW: React project
│   ├── src/
│   │   ├── App.tsx                     # Root component
│   │   ├── index.tsx                   # Entry point
│   │   ├── components/
│   │   │   ├── DashboardMetrics.tsx    # Metric cards
│   │   │   ├── RunningTable.tsx        # Active sessions
│   │   │   ├── RetryTable.tsx          # Retry queue
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useOrchestrationState.ts  # Fetch /api/v1/state
│   │   │   ├── useRealTimeUpdates.ts     # SSE or polling
│   │   │   └── ...
│   │   ├── types/
│   │   │   └── orchestra.types.ts      # TypeScript interfaces
│   │   └── styles/
│   │       └── dashboard.module.css    # Component styles
│   ├── public/
│   │   └── index.html                  # SPA entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts                  # Build config (Vite recommended)
│
└── priv/
    └── static/                          # Build output
        ├── index.html
        ├── assets/
        │   ├── main.js
        │   └── styles.css
        └── vendor/                      # Old Phoenix JS (can be deleted)
```

### 7.2 Key React Components

**DashboardPage.tsx (Root)**
```typescript
// Fetches initial state
// Sets up real-time listener
// Manages state updates
// Renders child components
```

**MetricCard.tsx (Reusable)**
```typescript
interface MetricCardProps {
  label: string;
  value: number | string;
  detail?: string;
}
// Simple display component
```

**RunningSessionsTable.tsx**
```typescript
// Displays running entries
// Formats timestamps
// Shows token usage
// Links to issue detail
```

**RetryQueueTable.tsx**
```typescript
// Displays retry entries
// Shows countdown to next retry
// Shows error messages
```

### 7.3 Type Definitions (TypeScript)

```typescript
// types/orchestra.types.ts

export interface OrchestrationState {
  generated_at: string;
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
  error?: {
    code: string;
    message: string;
  };
}

export interface RunningEntry {
  issue_id: string;
  issue_identifier: string;
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
  due_at: string;
  error: string;
  worker_host: string | null;
  workspace_path: string;
}
```

### 7.4 Custom Hooks

**useOrchestrationState.ts**
```typescript
export function useOrchestrationState() {
  const [state, setState] = useState<OrchestrationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const resp = await fetch('/api/v1/state');
      const data = await resp.json();
      setState(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  return { state, loading, error, refetch: fetchState };
}
```

**useRealTimeUpdates.ts**
```typescript
export function useRealTimeUpdates(onUpdate: () => void) {
  useEffect(() => {
    const eventSource = new EventSource('/api/v1/events');

    eventSource.addEventListener('observability_updated', () => {
      onUpdate();
    });

    return () => eventSource.close();
  }, [onUpdate]);
}
```

---

## Part 8: Build & Deployment

### 8.1 React Build Setup

**Recommended:** Vite + React + TypeScript

**package.json:**
```json
{
  "name": "symphony-react-frontend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "vite": "^4.3.0"
  }
}
```

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../priv/static',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/vendor': 'http://localhost:4000',
    }
  }
});
```

### 8.2 Integration with Elixir Build

**Update Makefile:**
```makefile
frontend-build:
	cd elixir/assets && npm run build

build: frontend-build
	$(MIX) build

dev-frontend:
	cd elixir/assets && npm run dev
```

**Add to mix.exs (optional):**
```elixir
defp aliases do
  [
    setup: ["deps.get", "..."],
    build: ["frontend:build", "escript.build"]
  ]
end
```

### 8.3 Deployment

**Option A: SPA in priv/static/**
- Build React to `elixir/priv/static/`
- Phoenix serves `index.html` for unknown routes (SPA routing)
- Single artifact: `bin/symphony` executable

**Option B: Separate Frontend Deployment**
- Build React independently
- Deploy to CDN (Cloudflare, S3, etc.)
- Update CORS in Phoenix if needed
- Two artifacts: API server + frontend

**Recommendation:** Option A (simpler, single deployment)

---

## Part 9: Migration Path

### 9.1 Phase 1: Parallel Dashboard (Week 1)

**Goal:** Get React running without breaking existing LiveView

1. Create `elixir/assets/` with basic React app
2. Build React to `priv/static-react/`
3. Add route: `get("/react", StaticAssetController, :react_index)`
4. React app fetches from `/api/v1/state`
5. Test with `./bin/symphony --port 4000 ./WORKFLOW.md`

**Risk:** Low (parallel, not replacing)

### 9.2 Phase 2: Feature Parity (Week 2)

**Goal:** React dashboard matches LiveView functionality

1. Implement all metric cards
2. Build running sessions table
3. Build retry queue table
4. Implement styling (match current CSS)
5. Test on real Symphony runs
6. A/B test with users (if applicable)

**Risk:** Medium (feature completeness)

### 9.3 Phase 3: Real-time Integration (Week 3)

**Goal:** React dashboard has parity with LiveView real-time updates

1. Implement SSE endpoint in Elixir (or polling)
2. React hook subscribes to real-time events
3. Auto-refresh on updates
4. Test under load (multi-agent scenarios)

**Risk:** Medium (real-time correctness)

### 9.4 Phase 4: Cutover (Week 4)

**Goal:** Replace LiveView with React

1. Update router to serve React on `/`
2. Fallback unknown routes to `index.html`
3. Remove `dashboard_live.ex` and related code
4. Clean up old CSS
5. Update documentation

**Risk:** Low (tested already)

---

## Part 10: Elixir-side Changes Needed

### 10.1 Router Update

**Current:**
```elixir
live("/", DashboardLive, :index)
```

**New (Option 1: Serve React SPA):**
```elixir
scope "/", SymphonyElixirWeb do
  # SPA routing: serve index.html for unknown routes
  match(:*, "/", SPA, :index)
end
```

**Implementation of SPA controller:**
```elixir
defmodule SymphonyElixirWeb.SPAController do
  @spec index(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def index(conn, _params) do
    # Serve priv/static/index.html for all routes
    # Phoenix will handle 404s automatically
    send_file(conn, 200, "priv/static/index.html")
  end
end
```

### 10.2 SSE Endpoint (Optional)

**New route:**
```elixir
get("/api/v1/events", ObservabilityApiController, :events)
```

**Implementation:**
```elixir
def events(conn, _params) do
  conn
  |> put_resp_header("content-type", "text/event-stream")
  |> put_resp_header("cache-control", "no-cache")
  |> stream_send_chunked(200)
  |> subscribe_and_stream()
end

defp subscribe_and_stream(conn) do
  :ok = ObservabilityPubSub.subscribe()
  stream_loop(conn)
end

defp stream_loop(conn) do
  receive do
    :observability_updated ->
      data = Jason.encode!(%{event: "observability_updated"})
      chunk = "data: #{data}\n\n"
      {:ok, conn} = Conn.chunk(conn, chunk)
      stream_loop(conn)
  end
end
```

### 10.3 CORS Headers (If needed)

**In endpoint.ex:**
```elixir
plug Corsica, origins: "*", allow_headers: ["content-type"]
```

### 10.4 Dependency Changes

**Add to mix.exs (optional for CORS):**
```elixir
{:corsica, "~> 1.3"}
```

---

## Part 11: Testing Strategy

### 11.1 E2E Testing

**Current Elixir E2E:** Real Linear + Codex

```bash
export LINEAR_API_KEY=...
make e2e  # Spins up SSH workers, runs real agent
```

**Add React E2E (using Playwright or Cypress):**
```bash
npm run test:e2e  # Spins up backend, runs React tests
```

### 11.2 API Contract Testing

**Verify React consumes API correctly:**

```typescript
// __tests__/api.test.ts
describe('API Integration', () => {
  it('fetches state payload', async () => {
    const resp = await fetch('/api/v1/state');
    expect(resp.status).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty('generated_at');
    expect(data).toHaveProperty('counts');
    expect(data.counts).toHaveProperty('running');
  });
});
```

---

## Part 12: Critical Details

### 12.1 Things That Work Well in Current Design

1. **API is stable** - No database layer means API won't change
2. **PubSub is simple** - Single channel, single message type
3. **State is fast** - All in-memory (GenServer), no DB queries
4. **Data shapes are predictable** - Presenter generates consistent JSON

### 12.2 Things to Watch For

1. **Real-time correctness** - SSE or polling must handle missed updates
2. **Client state sync** - React state must stay in sync with backend
3. **Timestamp formatting** - JavaScript's Date handling can differ from Elixir
4. **No persistence** - React state is lost on browser refresh (if stored client-side)
5. **Network latency** - API calls can take 15ms+, show loading states

### 12.3 Build Integration Challenges

1. **Separate build pipelines** - npm + mix, need to coordinate
2. **Asset versioning** - Handle cache busting properly
3. **Development experience** - Need separate dev servers (Vite + Phoenix)

### 12.4 Browser Compatibility

**Current CSS/JS:** Works on all modern browsers

**React minimum:** Modern browsers (Chrome 90+, Firefox 88+, Safari 14+)

---

## Part 13: Recommended Path Forward

### Quick Decision Tree

**Q: Need mobile support?**
- Yes → React SPA (easier responsive design)
- No → Keep LiveView or light enhancement

**Q: Want richer interactivity (drag/drop, filters)?**
- Yes → React SPA
- No → LiveView + Alpine.js

**Q: Want to stay with server-side rendering?**
- Yes → LiveView or htmx
- No → React SPA

**Q: Team familiar with React?**
- Yes → React SPA
- No → LiveView enhancement

### Final Recommendation

**For maximum flexibility and modern UI patterns:** Build React SPA using Strategy A (full replacement).

**Timeline:** 3-4 weeks (parallel development, not blocking current functionality)

**Effort:**
- 1 week: Setup Vite, basic React structure, component scaffolding
- 1 week: Implement all dashboard components, styling
- 1 week: Real-time integration, E2E tests
- 1 week: Polish, performance optimization, documentation

**Risk:** Low (API is stable, parallel with LiveView possible)

---

## Part 14: File Reference for React Dev

### Essential Elixir Files to Study

| File | Purpose | Priority |
|------|---------|----------|
| `lib/symphony_elixir_web/presenter.ex` | API data shapes | MUST READ |
| `lib/symphony_elixir_web/controllers/observability_api_controller.ex` | API handlers | MUST READ |
| `lib/symphony_elixir_web/router.ex` | Routes | MUST READ |
| `lib/symphony_elixir/http_server.ex` | Server startup | Should read |
| `lib/symphony_elixir_web/live/dashboard_live.ex` | Current UI logic | Should read |
| `priv/static/dashboard.css` | Design system | Should read |

### Key Configuration

| File | Purpose |
|------|---------|
| `elixir/AGENTS.md` | Code conventions (if modifying Elixir) |
| `elixir/Makefile` | Build targets |
| `elixir/mix.exs` | Dependencies |
| `WORKFLOW.md` | Runtime configuration |

---

**End of React Integration Analysis**

Next steps: Read `presenter.ex` to understand exact API contract, then start with Phase 1 (parallel React dashboard).

# Symphony Frontend POC - Local Development Setup Guide

## Prerequisites

Before setting up the Symphony Frontend POC, ensure you have the following installed and configured.

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | >= 18.x (LTS recommended) | Frontend build tooling and Vite dev server |
| **npm** | >= 9.x | Package management (ships with Node.js) |
| **Elixir** | ~> 1.19 | Backend runtime (Elixir/OTP reference implementation) |
| **Erlang/OTP** | >= 27.x | BEAM VM required by Elixir |
| **Git** | >= 2.x | Version control and workspace management |
| **mise** | latest | Recommended toolchain manager for Elixir/Erlang |

### Required Credentials & Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LINEAR_API_KEY` | Yes (Linear tracker) | Personal API key from Linear (Settings > Security & access > Personal API keys) |
| `SYMPHONY_WORKSPACE_ROOT` | Optional | Override default workspace root directory (default: `~/code/symphony-workspaces`) |
| `SYMPHONY_LIVE_SSH_WORKER_HOSTS` | Optional | Comma-separated SSH hosts for remote worker mode |

For **Jira** tracker mode, set these instead:
- `JIRA_ENDPOINT` - Your Jira base URL (e.g., `https://<org>.atlassian.net`)
- `JIRA_API_KEY` - Format: `email:api_token` (Basic Auth)

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/openai/symphony
cd symphony
```

---

## Step 2: Elixir Backend Setup

### 2.1 Install Elixir/Erlang via mise

The project recommends [mise](https://mise.jdx.dev/) for managing Elixir and Erlang versions.

```bash
# Install mise (if not already installed)
curl https://mise.jdx.dev/install.sh | sh

# From the elixir directory, trust and install toolchain
cd elixir
mise trust
mise install
```

Verify installation:

```bash
mise exec -- elixir --version
# Expected output: Elixir 1.19.x (compiled with Erlang/OTP 27)
```

### 2.2 Fetch Dependencies and Build

```bash
cd elixir

# Install Elixir dependencies
mise exec -- mix setup

# Build the escript binary
mise exec -- mix build
```

This creates the executable at `elixir/bin/symphony`.

### 2.3 Configure WORKFLOW.md

Symphony reads its runtime configuration from a `WORKFLOW.md` file with YAML front matter. The repository ships a reference workflow at `elixir/WORKFLOW.md`.

To customize for your project:

1. Copy the reference workflow to your target repo:
   ```bash
   cp elixir/WORKFLOW.md /path/to/your/repo/WORKFLOW.md
   ```

2. Edit the YAML front matter:
   ```yaml
   ---
   tracker:
     kind: linear                    # linear | memory | jira
     project_slug: "your-project-slug"
   workspace:
     root: ~/code/workspaces
   hooks:
     after_create: |
       git clone git@github.com:your-org/your-repo.git .
   agent:
     max_concurrent_agents: 10
     max_turns: 20
   codex:
     command: codex app-server
   ---
   ```

3. Find your Linear project slug by right-clicking the project in Linear and copying the URL -- the slug is in the URL path.

### 2.4 Configure Linear Custom Statuses

The default workflow depends on non-standard Linear issue statuses. Add these in Linear under Team Settings > Workflow:

- **Rework** -- Reviewer requested changes
- **Human Review** -- PR attached, waiting on human approval
- **Merging** -- Approved, executing the land flow

---

## Step 3: Frontend Setup (Vite + React + TypeScript)

### 3.1 Initialize the Frontend Project

From the repository root:

```bash
# Create frontend directory
mkdir -p frontend
cd frontend

# Initialize with Vite + React + TypeScript
npm create vite@latest . -- --template react-ts

# Install core dependencies
npm install

# Install project-specific dependencies
npm install @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Install testing dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

### 3.2 Configure Vite Proxy

Edit `frontend/vite.config.ts` to proxy API requests to the Elixir backend:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

This proxies all `/api/*` requests to the Elixir backend, eliminating CORS issues during development.

### 3.3 Configure Tailwind

Edit `frontend/tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#10a37f',
        danger: '#b42318',
        muted: '#6e6e80',
        ink: '#202123',
        page: '#f7f7f8',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

### 3.4 Set Up Folder Structure

```bash
cd frontend/src
mkdir -p api hooks types components/{layout,agents,board,tasks,shared} lib styles
```

See `docs/designs/frontend-architecture.md` for the full folder layout and what goes in each directory.

### 3.5 Verify API Connectivity

After starting both servers (see Step 4), open browser devtools console at `http://localhost:3000`:

```javascript
fetch('/api/v1/state').then(r => r.json()).then(console.log)
```

If you see a JSON response with `generated_at`, the proxy is working correctly.

### 3.6 Development Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run preview      # Preview production build locally
npm run type-check   # TypeScript type checking
npm run lint         # ESLint
npm run test         # Run tests (Vitest)
npm run test:watch   # Watch mode tests
```

---

## Step 4: Running Locally

### Start the Elixir Backend

```bash
cd elixir

# Basic start (no web dashboard)
mise exec -- ./bin/symphony ./WORKFLOW.md

# With web dashboard on port 4000
mise exec -- ./bin/symphony ./WORKFLOW.md --port 4000

# With custom log directory
mise exec -- ./bin/symphony ./WORKFLOW.md --port 4000 --logs-root /tmp/symphony-logs
```

### Verify the Backend is Running

Once started with `--port`, the following endpoints become available:

| URL | Description |
|-----|-------------|
| `http://localhost:4000/` | Phoenix LiveView dashboard |
| `http://localhost:4000/api/v1/health` | Health check |
| `http://localhost:4000/api/v1/tasks` | Task CRUD API |
| `http://localhost:4000/api/v1/agents` | Agent state API |
| `http://localhost:4000/api/v1/events` | SSE real-time stream |
| `http://localhost:4000/api/v1/state` | Orchestrator state snapshot |

Test with curl:

```bash
curl http://localhost:4000/api/v1/state | python3 -m json.tool
```

### Start the Frontend Dev Server

```bash
cd frontend
npm run dev
# Open http://localhost:3000 in your browser
```

The Vite dev server proxies `/api/*` requests to `localhost:4000`, so the backend must be running first.

---

## Step 5: Running Tests

### Elixir Tests

```bash
cd elixir

# Run all tests + linting + coverage + dialyzer
make all

# Individual targets
make test          # Unit tests only
make coverage      # Tests with coverage report
make lint          # Credo strict + specs check
make fmt-check     # Format verification
make dialyzer      # Static analysis (first run is slow)
```

### End-to-End Tests

The E2E tests create real Linear resources and launch actual Codex sessions:

```bash
cd elixir
export LINEAR_API_KEY=lin_api_...
make e2e
```

E2E runs two scenarios:
1. **Local worker** -- runs Codex on the local machine
2. **SSH workers** -- uses `docker compose` to spin up disposable SSH worker containers (or targets real hosts via `SYMPHONY_LIVE_SSH_WORKER_HOSTS`)

### Frontend Tests

```bash
cd frontend
npm run test         # Vitest unit tests
npm run test:watch   # Watch mode
npm run lint         # ESLint
npm run type-check   # TypeScript checking
```

---

## Project Structure Reference

```
symphony/
+-- README.md                  # Project overview
+-- SPEC.md                    # Language-agnostic specification (80KB+)
+-- LICENSE                    # Apache 2.0
+-- .codex/                    # Repository skills (commit, push, pull, land, linear)
+-- .github/                   # PR templates, media assets
+-- docs/                      # Planning docs, brainstorms, ADRs
+-- elixir/                    # Elixir/OTP reference implementation
|   +-- lib/
|   |   +-- symphony_elixir.ex              # Entry point + OTP Application
|   |   +-- symphony_elixir/
|   |   |   +-- orchestrator.ex             # Core polling & dispatch (GenServer)
|   |   |   +-- agent_runner.ex             # Worker execution wrapper
|   |   |   +-- status_dashboard.ex         # Terminal status rendering
|   |   |   +-- config.ex                   # Configuration loader
|   |   |   +-- workflow.ex                 # WORKFLOW.md parser
|   |   |   +-- workspace.ex               # Filesystem isolation
|   |   |   +-- ssh.ex                      # SSH remote worker support
|   |   |   +-- http_server.ex              # Phoenix server bootstrap
|   |   |   +-- tracker.ex                  # Tracker abstraction layer
|   |   |   +-- tracker/memory.ex           # In-memory tracker (testing)
|   |   |   +-- linear/                     # Linear GraphQL client
|   |   |   +-- jira/                       # Jira REST client (PoC)
|   |   |   +-- codex/                      # Codex app-server integration
|   |   +-- symphony_elixir_web/
|   |       +-- endpoint.ex                 # Phoenix endpoint
|   |       +-- router.ex                   # Route definitions
|   |       +-- live/dashboard_live.ex      # LiveView dashboard
|   |       +-- controllers/               # API controllers
|   |       +-- presenter.ex               # API/dashboard data models
|   +-- test/                              # ExUnit tests
|   +-- config/config.exs                  # Phoenix configuration
|   +-- mix.exs                            # Project definition
|   +-- Makefile                           # Build targets
|   +-- WORKFLOW.md                        # Reference workflow contract
|   +-- bin/symphony                       # Built escript binary
+-- frontend/                  # React frontend (planned/in-progress)
```

---

## Key Architecture Concepts

### OTP Supervision Tree

The application starts these supervised processes:

1. **Phoenix.PubSub** -- Real-time event broadcast (powers LiveView updates)
2. **Task.Supervisor** -- Manages async task execution
3. **WorkflowStore** -- Caches and hot-reloads `WORKFLOW.md`
4. **Orchestrator** -- Core GenServer: poll loop, dispatch, retry, reconciliation
5. **HttpServer** -- Conditionally starts Phoenix when `--port` is set
6. **StatusDashboard** -- Terminal status rendering and state aggregation

### Data Flow

```
Linear/Jira API  -->  Orchestrator  -->  Workspace Manager  -->  Agent Runner  -->  Codex
     ^                     |                                          |
     |                     v                                          v
     |              StatusDashboard  <--  PubSub events  <--  Codex events
     |                     |
     +-- reconciliation ---+
```

### Tracker Abstraction

Symphony supports multiple issue trackers through a unified adapter pattern:
- `linear` -- Full support via GraphQL API
- `jira` -- PoC support via REST API
- `memory` -- In-memory tracker for testing/development

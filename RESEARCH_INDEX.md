# Symphony Project Research Index

**Date:** March 18, 2026  
**Status:** Complete analysis of project structure, frontend, and architecture  
**Scope:** Full codebase examination, 100+ files reviewed

---

## Quick Start

1. **First time?** Start with → **FRONTEND_GUIDE.md** (practical quick reference)
2. **Deep dive?** Read → **ARCHITECTURE.md** (comprehensive technical details)
3. **Setup?** Follow → **elixir/README.md** (environment setup)

---

## Documentation Files

### FRONTEND_GUIDE.md (12KB, 525 lines)
**For practical developers** - How to work with the code

Contents:
- Key files and their responsibilities
- Data flow explanation with diagrams
- Dashboard layout breakdown
- Step-by-step feature addition guides
- State structure reference
- CSS classes reference
- Common patterns and troubleshooting
- Development workflow commands

**Best for:** Adding features, modifying UI, understanding patterns

---

### ARCHITECTURE.md (24KB, 734 lines)
**For architects and deep understanding** - Complete technical analysis

Contents:
- Full project structure and directory layout
- Frontend stack and architectural decisions
- State management and data flow diagrams
- Component breakdown with code examples
- API endpoints and data models with payloads
- Styling and design system
- Build and development setup
- Configuration and extensibility
- Key architectural patterns (15 detailed patterns)
- Code quality standards
- Quick reference file paths
- Architectural trade-offs and rationale

**Best for:** Understanding why decisions were made, overall architecture, mentoring

---

### elixir/AGENTS.md
**Project conventions** - Code quality rules and standards

Contains:
- Required @spec declarations
- Test coverage requirements (100%)
- Code style patterns
- Documentation policy
- PR requirements

---

### elixir/README.md
**Setup and operation** - How to run Symphony

Contains:
- Prerequisites (Elixir, Erlang, mise)
- Installation steps
- Configuration options
- WORKFLOW.md contract
- Features and capabilities

---

### SPEC.md (80KB+)
**Language-agnostic specification** - Reference implementation contract

Contains:
- Problem statement and goals
- Operational semantics
- Tracker contract
- Workspace semantics
- Agent execution model
- Dashboard API specification

---

## Project Overview

**Symphony** is an autonomous agent orchestration service:
- Polls issue trackers (Linear, Jira, memory)
- Creates isolated workspaces per issue
- Runs Codex in app-server mode
- Provides observability dashboard
- Manages retries and completion tracking

**Technology Stack:**
- Language: Elixir 1.19 / OTP 28
- Web: Phoenix 1.8 + LiveView 1.1
- HTTP: Bandit
- Real-time: Phoenix.PubSub
- Templating: HEEx (server-side)
- CSS: Hand-written with CSS variables
- Testing: ExUnit (100% coverage)

**Architecture:**
- GenServer for orchestration
- LiveView for real-time dashboard
- Presenter layer for API/UI data
- PubSub for state broadcasts
- Workspace isolation for safety

---

## Key Files

### Frontend (Web Layer)
- `elixir/lib/symphony_elixir_web/live/dashboard_live.ex` - Main dashboard component
- `elixir/lib/symphony_elixir_web/router.ex` - Routes and endpoints
- `elixir/lib/symphony_elixir_web/presenter.ex` - API data models
- `elixir/lib/symphony_elixir_web/components/layouts.ex` - HTML layouts
- `elixir/priv/static/dashboard.css` - Styling

### Orchestration (Core Logic)
- `elixir/lib/symphony_elixir/orchestrator.ex` - Main GenServer (52KB)
- `elixir/lib/symphony_elixir.ex` - Entry point
- `elixir/lib/symphony_elixir/application.ex` - OTP supervisor
- `elixir/lib/symphony_elixir/http_server.ex` - Phoenix startup

### Configuration
- `elixir/WORKFLOW.md` - Orchestration contract (YAML front matter + Markdown)
- `elixir/lib/symphony_elixir/config.ex` - Config loader
- `elixir/config/config.exs` - Phoenix configuration

### Testing & Validation
- `elixir/test/` - ExUnit test suite
- `elixir/test/fixtures/status_dashboard_snapshots/` - Snapshot tests

---

## Architecture Highlights

### State Management
```
Orchestrator (GenServer)
  ├─ Maintains: running, retrying, completed issues
  ├─ Tracks: token usage, session IDs, retry attempts
  ├─ Broadcasts: PubSub :observability_updated
  └─ Exposes: API via Presenter

Dashboard (LiveView)
  ├─ Subscribes to PubSub
  ├─ Updates every 1 second (runtime_tick)
  └─ Re-renders on state changes
```

### Issue Lifecycle
```
Pending → Claimed → Running → Completed → Retry/Terminal
              ↓
        GenServer spawned
              ↓
        Process monitored
              ↓
        On completion:
        - If active: retry (exponential backoff)
        - If terminal: cleanup workspace
```

### Frontend Architecture
- **No JavaScript frameworks** (zero React/Vue overhead)
- **Server-side rendering** (HEEx templates)
- **WebSocket updates** (Phoenix PubSub)
- **Single component** (entire dashboard in one LiveView)
- **Real-time** (automatic re-render on state change)

---

## Development Workflow

### Setup
```bash
cd elixir
mise trust && mise install
mix setup
mix build
```

### Run (with dashboard)
```bash
./bin/symphony --port 4000 ./WORKFLOW.md
# Open http://localhost:4000
```

### Testing
```bash
make all                      # Full quality gate
mix test --watch             # Watch mode
mix format --check-formatted
mix credo --strict
mix dialyzer
```

### Add Features
1. Edit `dashboard_live.ex` (render template)
2. Update `presenter.ex` (data transformation)
3. Add route if needed (router.ex)
4. Add tests (test/fixtures/)
5. Run `make all` to verify

---

## Common Questions

**Q: Why no JavaScript framework?**
A: Reduces bundle size, eliminates state sync issues, faster iteration with server-side rendering.

**Q: Why Elixir?**
A: BEAM/OTP for long-running orchestration, natural supervisor patterns, strong concurrency primitives.

**Q: Why single LiveView component?**
A: Dashboard fits naturally in one view, real-time updates are straightforward, simple mental model.

**Q: How does real-time work?**
A: Orchestrator broadcasts PubSub events → Dashboard handle_info receives → re-assigns state → re-renders template → sent to browser via WebSocket.

**Q: How do I add a new metric card?**
A: Edit `dashboard_live.ex` render, add new `<article>` block, update presenter to provide data.

**Q: How do I add a new table section?**
A: Edit `dashboard_live.ex` render, add new `<section>` with `<table>`, update presenter for data.

**Q: How are API endpoints added?**
A: Add route to `router.ex`, handler to `observability_api_controller.ex`, presenter method to transform data.

---

## Code Quality Standards

- **Coverage:** 100% (excluding infrastructure modules)
- **Public functions:** All must have `@spec`
- **Quality gates:** Format check, credo lint, coverage, dialyzer
- **Testing:** ExUnit unit tests + snapshot tests
- **Documentation:** Keep AGENTS.md, README.md, WORKFLOW.md current

---

## Recent Changes (feat/explore branch)

1. Jira tracker implementation (beta)
2. SSH worker support for distributed execution
3. Plan publisher for Jira (experimental)
4. E2E testing infrastructure
5. Stabilized orchestration and policy handling

---

## Next Steps

### For New Contributors
1. Read FRONTEND_GUIDE.md
2. Clone and setup locally
3. Run tests locally
4. Pick a feature from the extension points
5. Create a PR

### For Architects/Designers
1. Read ARCHITECTURE.md
2. Review SPEC.md for language-agnostic definition
3. Examine orchestrator.ex for concurrency patterns
4. Understand GenServer state machine

### For Operators
1. Read elixir/README.md for setup
2. Configure WORKFLOW.md for your tracker/workspace
3. Deploy via bin/symphony or Docker
4. Monitor via dashboard at http://localhost:PORT

---

## File Organization

```
Symphony Project Root
├── RESEARCH_INDEX.md          ← You are here
├── ARCHITECTURE.md            ← Technical deep dive
├── FRONTEND_GUIDE.md          ← Practical quick reference
├── README.md                  ← Project overview
├── SPEC.md                    ← Language-agnostic spec
├── elixir/
│   ├── README.md             ← Elixir setup
│   ├── AGENTS.md             ← Code conventions
│   ├── WORKFLOW.md           ← Orchestration contract
│   ├── lib/
│   │   ├── symphony_elixir.ex
│   │   ├── symphony_elixir/
│   │   │   ├── orchestrator.ex
│   │   │   ├── application.ex
│   │   │   └── ...
│   │   └── symphony_elixir_web/
│   │       ├── live/
│   │       ├── controllers/
│   │       ├── components/
│   │       └── router.ex
│   ├── test/
│   ├── priv/static/
│   └── config/
└── docs/
```

---

## Research Completion Checklist

- [x] Project layout and structure analyzed
- [x] Frontend framework identified (Phoenix + LiveView)
- [x] State management documented (GenServer + PubSub)
- [x] Key components identified (Dashboard, Orchestrator, Presenter)
- [x] API endpoints documented
- [x] Data models specified
- [x] Build process documented
- [x] Development workflow established
- [x] Code quality standards identified
- [x] Architectural patterns documented
- [x] File paths catalogued
- [x] Extension points identified
- [x] Common patterns explained
- [x] Troubleshooting guide created
- [x] Quick reference created
- [x] Comprehensive architecture doc created

---

**Analysis Complete. Ready for Implementation.**

Start with **FRONTEND_GUIDE.md** for practical guidance or **ARCHITECTURE.md** for comprehensive understanding.

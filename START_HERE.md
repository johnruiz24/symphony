# Symphony React Frontend Integration - START HERE

**Complete analysis for integrating a React frontend with Symphony orchestrator**

---

## Your Questions Answered

### 1. Project Structure
**Location:** `/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/`

**Elixir Backend:** `elixir/lib/`
- Orchestrator: `elixir/lib/symphony_elixir/orchestrator.ex` (52KB GenServer)
- Frontend code: `elixir/lib/symphony_elixir_web/`
- Static assets: `elixir/priv/static/`

**See:** `ANALYSIS_SUMMARY.txt` for quick reference

---

### 2. Current Frontend
**Status:** Phoenix LiveView with ZERO JavaScript frameworks
- **Framework:** Server-side rendered HEEx templates
- **HTTP Server:** Bandit (modern Erlang)
- **Real-time:** Phoenix PubSub via WebSocket
- **CSS:** Single 8KB vanilla CSS file
- **Result:** Fast, minimal JS, real-time dashboard

**See:** `REACT_INTEGRATION_PLAN.md` Part 2 "Current Architecture"

---

### 3. API Patterns
**Three JSON Endpoints:**

1. `GET /api/v1/state` → Full orchestration metrics
2. `GET /api/v1/:issue_id` → Per-issue detail
3. `POST /api/v1/refresh` → Trigger poll cycle

**All data:** In-memory, JSON, stable schema
**See:** `REACT_INTEGRATION_PLAN.md` Part 3 "API Contract"
**TypeScript types:** Ready-to-use in `REACT_QUICK_START.md` Section 2

---

### 4. DynamoDB Integration
**Current status:** NONE
- All state in-memory GenServer
- No database layer
- No persistence (state lost on restart)

**Implication:** React is read-only observer of real-time state

---

### 5. CLAUDE.md Guidance
**Project level:** No project-specific CLAUDE.md exists

**Comes from:**
- `elixir/AGENTS.md` - Code conventions
- `elixir/README.md` - Setup instructions
- `ARCHITECTURE.md` - Technical details

**Key rule:** All public functions need `@spec` (if modifying Elixir)

---

### 6. Build & Test Setup
**Commands:**
```bash
cd elixir
mix setup                           # Install deps
mix build                           # Create executable
make all                            # Full quality gate
./bin/symphony --port 4000 ./WORKFLOW.md  # Run with dashboard
```

**See:** `ANALYSIS_SUMMARY.txt` Section 6

---

## Documentation Map

### Quick Start (Pick One)

**Option A: "Just give me the code"**
1. Read: `REACT_QUICK_START.md` (copy/paste ready)
2. Do: Follow "Project Setup Steps"
3. Done: You're building React

**Option B: "I need to understand the architecture"**
1. Read: `ANALYSIS_SUMMARY.txt` (this document)
2. Read: `REACT_INTEGRATION_PLAN.md` Part 1-3
3. Do: Follow setup steps

**Option C: "Full deep dive"**
1. Read: `ARCHITECTURE.md` (24KB, 734 lines)
2. Read: `REACT_INTEGRATION_PLAN.md` (14KB, 380 lines)
3. Read: `REACT_QUICK_START.md` (12KB, 420 lines)
4. Study: `elixir/lib/symphony_elixir_web/presenter.ex`
5. Study: `elixir/priv/static/dashboard.css`

---

## Document Quick Reference

| Document | Purpose | Read Time | When |
|----------|---------|-----------|------|
| **START_HERE.md** | Navigation guide | 5 min | First |
| **ANALYSIS_SUMMARY.txt** | Executive summary | 10 min | Second |
| **REACT_QUICK_START.md** | Copy/paste code | 15 min | Before coding |
| **REACT_INTEGRATION_PLAN.md** | Full strategy | 30 min | For architecture |
| **ARCHITECTURE.md** | Deep technical | 45 min | For completeness |
| **RESEARCH_INDEX.md** | Document index | 5 min | Navigation |

---

## The Cliff Notes Version

**Symphony** = Agent orchestrator that:
- Polls issue trackers (Linear, Jira)
- Creates isolated workspaces
- Runs Codex agents
- Provides real-time observability

**Current Frontend** = Phoenix LiveView (server-rendered, no JS framework)

**Your Task** = Replace with React SPA

**API** = 3 stable JSON endpoints (`/api/v1/state`, `/api/v1/:id`, `/api/v1/refresh`)

**Real-time** = PubSub broadcasts (WebSocket or SSE)

**State** = In-memory only (no database)

**Timeline** = 3-4 weeks (can be parallel with LiveView)

**Risk** = Low (API is stable, can test independently)

---

## Right Now: What to Do

### Step 1: Read Summary (10 minutes)
```bash
cat ANALYSIS_SUMMARY.txt
```

### Step 2: Choose Your Path

**Path A: Practical Setup (Fastest)**
- Open: `REACT_QUICK_START.md`
- Jump to: Section 7 "Project Setup Steps"
- Follow: Step 1-5
- Result: React app running locally

**Path B: Strategic Understanding (Better for decisions)**
- Open: `REACT_INTEGRATION_PLAN.md`
- Read: Part 1 (Current Architecture)
- Read: Part 2 (API Contract)
- Read: Part 6 (Integration Strategies)
- Decision: Full replacement vs. parallel vs. enhancement

**Path C: Full Mastery (Most complete)**
- Open: `ARCHITECTURE.md`
- Read: Sections 1-5
- Then: Follow Path B

### Step 3: Study the API
**File:** `/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/elixir/lib/symphony_elixir_web/presenter.ex`

This defines exactly what your React app will receive.

### Step 4: Start Building
**Setup:**
```bash
cd elixir
npm create vite@latest assets -- --template react-ts
cd assets
npm install
```

**Configure:**
Copy `vite.config.ts` from `REACT_QUICK_START.md` Section 7

**Build:**
```bash
npm run build
cd ..
./bin/symphony --port 4000 ./WORKFLOW.md
```

**Visit:**
`http://localhost:4000`

---

## Key Files to Know

### Essential (Read First)
- `REACT_INTEGRATION_PLAN.md` - Your roadmap
- `REACT_QUICK_START.md` - Your code templates
- `elixir/lib/symphony_elixir_web/presenter.ex` - API contract
- `elixir/priv/static/dashboard.css` - Design system

### Important (Reference)
- `elixir/lib/symphony_elixir_web/router.ex` - Routes
- `elixir/lib/symphony_elixir_web/live/dashboard_live.ex` - Current UI
- `elixir/lib/symphony_elixir/orchestrator.ex` - State machine

### Complete (Deep Dive)
- `ARCHITECTURE.md` - Full technical analysis (24KB)
- `elixir/AGENTS.md` - Code conventions
- `elixir/README.md` - Setup instructions

---

## Common Questions

**Q: Do I need to keep LiveView?**
A: No. Either replace completely or run in parallel during transition.

**Q: Where's the database?**
A: There isn't one. All state is in-memory (GenServer).

**Q: How do I get real-time updates?**
A: Option 1: Implement SSE endpoint (recommended). Option 2: Polling. Option 3: Keep WebSocket.

**Q: Can I start without removing LiveView?**
A: Yes! Run React at `/react-dashboard` while keeping LiveView at `/`.

**Q: What's the hardest part?**
A: Real-time sync correctness. Keep it simple (polling first, WebSocket later).

**Q: How long to replicate current dashboard?**
A: 2-3 days (1 day setup, 1-2 days components).

**Q: Can I use Next.js instead of Vite?**
A: Yes, but Vite is simpler for a SPA. Both work.

---

## Decision Time

### Choose Your Integration Strategy

**Option 1: Full SPA Replacement (Recommended)**
- Replace LiveView completely with React
- Build to `elixir/priv/static/`
- Simplest in long run
- **Start:** `REACT_INTEGRATION_PLAN.md` Section 6 Strategy A

**Option 2: Parallel Dashboard**
- React at `/react-dashboard`, LiveView at `/`
- Lower risk (can fall back to LiveView)
- More maintenance
- **Start:** `REACT_INTEGRATION_PLAN.md` Section 6 Strategy B

**Option 3: Enhance LiveView**
- Add Alpine.js or htmx for interactivity
- Keep Elixir server-side rendering
- Minimal changes
- **Start:** `REACT_INTEGRATION_PLAN.md` Section 6 Strategy C

---

## Next Actions

### Immediately
1. Read `ANALYSIS_SUMMARY.txt` (10 min)
2. Choose strategy (5 min)
3. Open `REACT_QUICK_START.md` (10 min)

### Within 1 hour
4. Study `presenter.ex` (15 min)
5. Study `dashboard.css` (10 min)

### Within 1 day
6. Follow "Project Setup Steps" from `REACT_QUICK_START.md`
7. Get React running locally
8. Fetch `/api/v1/state` from React

### Within 1 week
9. Build all dashboard components
10. Implement styling
11. Add real-time updates

---

## Support Reference

**If stuck on:**
- **API contract** → `REACT_INTEGRATION_PLAN.md` Part 3
- **Component layout** → `REACT_QUICK_START.md` Section 5
- **Setup** → `REACT_QUICK_START.md` Section 7
- **State machine** → `ARCHITECTURE.md` Part 5
- **Build integration** → `REACT_INTEGRATION_PLAN.md` Part 8
- **Elixir changes** → `REACT_INTEGRATION_PLAN.md` Part 10

---

## File Locations (Absolute Paths)

```
/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/
├── START_HERE.md                    # You are here
├── ANALYSIS_SUMMARY.txt              # Quick reference
├── REACT_INTEGRATION_PLAN.md         # Full strategy
├── REACT_QUICK_START.md              # Code templates
├── ARCHITECTURE.md                   # Technical deep dive
├── RESEARCH_INDEX.md                 # Document index
│
└── elixir/
    ├── lib/symphony_elixir_web/
    │   ├── presenter.ex              # API data shapes (STUDY THIS)
    │   ├── router.ex                 # Routes
    │   ├── live/dashboard_live.ex    # Current UI
    │   └── controllers/
    │       └── observability_api_controller.ex  # API handlers
    │
    ├── priv/static/
    │   └── dashboard.css             # Design system (STUDY THIS)
    │
    ├── bin/symphony                  # Executable
    └── Makefile                       # Build targets
```

---

**Status:** Analysis complete. You have everything needed to start building.

**Ready?** Start with `ANALYSIS_SUMMARY.txt`, then `REACT_QUICK_START.md`.

**Questions?** Check the document reference above or read `ARCHITECTURE.md` for complete details.

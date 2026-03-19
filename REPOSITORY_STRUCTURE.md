# Repository Structure

Complete map of the Symphony Frontend POC repository organization.

---

## 📁 Root Level

```
symphony/
├── README.md                 ← START HERE (main entry point)
├── SYSTEM_STATUS.md          ← Live system metrics
├── LICENSE                   ← MIT License
├── package.json              ← Root dependencies
├── package-lock.json
└── .gitignore
```

**Root contains only essentials.** All documentation organized in `docs/`.

---

## 📚 Documentation Structure

### `docs/` — All Documentation

#### `docs/guides/` — Getting Started
- **START_HERE.md** — Project overview, quick start, feature list
- **START_HERE.txt** — Plain text version
- **REACT_QUICK_START.md** — Frontend development guide
- **READ_ME_FIRST.txt** — Important notes
- **README.md** — Original project README (legacy)

#### `docs/architecture/` — System Design
- **ARCHITECTURE.md** — Component diagram, data flow, API design
- **FLOW_DIAGRAMS.md** — User workflows, state flows, interactions

#### `docs/research/` — Implementation Details
- **FRONTEND_PATTERNS_CHECKLIST.md** — React patterns, hooks, state management
- **FRONTEND_FLOW_ANALYSIS.md** — UI state machine, data flow analysis
- **ELIXIR_PHOENIX_RESEARCH.md** — Backend architecture, SSE streaming

#### `docs/learnings/` — Insights & Findings
- **INSTITUTIONAL_LEARNINGS.md** — Key patterns, best practices, lessons
- **GAPS_SUMMARY.md** — Known limitations, future improvements
- **ANALYSIS_COMPLETE.md** — Analysis summary
- **LEARNINGS_INDEX.md** — Index of all learnings
- **CODE_REVIEW_FINDINGS.md** — Code review results
- **DETAILED_FINDINGS.md** — Detailed review breakdown
- **REVIEW_SUMMARY.txt** — Review summary

#### `docs/INDEX.md` — Documentation Index
Quick navigation guide to all documentation.

---

## 💻 Application Code

### `frontend/` — React Application
```
frontend/
├── src/
│   ├── App.tsx              ← Main app component
│   ├── components/          ← React components
│   ├── hooks/               ← Custom hooks
│   ├── styles/              ← CSS/styling
│   └── types/               ← TypeScript types
├── public/                  ← Static assets
├── dist/                    ← Built artifacts
├── package.json             ← Dependencies
└── vite.config.ts           ← Vite configuration
```

### `elixir/` (backend/) — Phoenix Backend
```
elixir/
├── lib/
│   ├── symphony/            ← App modules
│   ├── symphony_web/        ← Web layer
│   │   ├── controllers/     ← API endpoints
│   │   └── views/
│   └── symphony.ex          ← App entry
├── config/                  ← Configuration
├── priv/                    ← Database migrations
├── test/                    ← Tests
└── mix.exs                  ← Dependencies
```

---

## 🧪 Testing

### `e2e/` — End-to-End Tests
```
e2e/
├── tests/                   ← Playwright test files
├── fixtures/                ← Test data
├── helpers/                 ← Test utilities
├── playwright.config.ts     ← Playwright config
└── package.json
```

---

## 🎬 Demo & Media

### `demo/` — Interactive Demo
```
demo/
├── LIVE_DEMO.html           ← Full walkthrough
├── FRAMES_VIEWER.html       ← 30-frame viewer
├── frames/                  ← 30 PNG screenshot frames
├── videos/                  ← Demo videos
└── README.md                ← Demo guide
```

### `screenshots/` — Captured Screenshots
Project screenshots and mockups.

---

## 🔧 Scripts & Utilities

### `scripts/` — Automation
- `capture-*.js` — Demo frame capture utilities

---

## 📊 Project Files

- **package.json** — Root dependencies (Playwright, etc.)
- **package-lock.json** — Dependency lock file
- **.gitignore** — Git exclusions
- **LICENSE** — MIT License

---

## Navigation Guide

### 🎯 Find What You Need

| Need | Location |
|------|----------|
| **Quick Start** | `docs/guides/START_HERE.md` |
| **Setup Instructions** | `README.md` → Quick Start section |
| **How to Build** | `frontend/` or `elixir/` README |
| **Architecture Diagram** | `docs/architecture/ARCHITECTURE.md` |
| **React Patterns** | `docs/research/FRONTEND_PATTERNS_CHECKLIST.md` |
| **Backend Details** | `docs/research/ELIXIR_PHOENIX_RESEARCH.md` |
| **Key Learnings** | `docs/learnings/INSTITUTIONAL_LEARNINGS.md` |
| **Code Review Results** | `docs/learnings/CODE_REVIEW_FINDINGS.md` |
| **Demo / Video** | `demo/LIVE_DEMO.html` |
| **Frame Viewer** | `demo/FRAMES_VIEWER.html` |
| **System Status** | `SYSTEM_STATUS.md` |
| **Tests** | `e2e/tests/` |

---

## 📈 Directory Statistics

| Category | Count |
|----------|-------|
| Documentation Files | 18 |
| API Endpoints | 9 |
| React Components | 6+ |
| Test Files | 57 |
| Code Coverage | 88% |
| Demo Frames | 30 |

---

## 🚀 Quick Access

```bash
# View documentation index
cat docs/INDEX.md

# View repo structure
cat REPOSITORY_STRUCTURE.md

# Start frontend
cd frontend && npm run dev

# Start backend
cd elixir && iex -S mix phx.server

# Run tests
cd e2e && npx playwright test

# View demo
open demo/LIVE_DEMO.html
```

---

**Last Updated:** March 19, 2026
**Maintainer:** Symphony Team

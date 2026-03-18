# Symphony Frontend POC - E2E Test Plan

**Owner:** QA/Integration (Phase 4)
**Status:** Infrastructure ready, awaiting implementation
**Last Updated:** 2026-03-18

---

## 1. Scope

This test plan covers end-to-end validation of the Symphony Frontend POC,
including API contract verification, browser-based UI testing, real-time
SSE event delivery, error resilience, and performance benchmarking.

### In Scope
- Task CRUD API endpoints (POST/GET/PATCH /api/v1/tasks)
- Agent API endpoints (GET /api/v1/agents)
- SSE streaming endpoint (GET /api/v1/events)
- Existing observability endpoints (GET /api/v1/state, /:id, POST /refresh)
- React Kanban board UI (create, drag-drop, filter, search)
- Real-time updates (SSE event to UI render)
- DynamoDB persistence (task survives restart)
- Error handling (network failure, invalid input, XSS)
- Performance (100+ tasks, <1s latency, 50 concurrent agents)

### Out of Scope
- Elixir unit tests (covered by existing mix test suite)
- Linear/Jira integration testing (covered by existing live_e2e_test.exs)
- Production deployment (Phase 5)

---

## 2. Test Environments

| Environment | Backend | Frontend | Database | Purpose |
|-------------|---------|----------|----------|---------|
| Local Dev | Elixir on :4000 | Vite dev on :5173 | DynamoDB Local (Docker :8000) | Development |
| CI | Elixir on :4000 | Built static assets | DynamoDB Local (Docker :8000) | Automated |

### Prerequisites
- Elixir/OTP installed (mise.toml)
- Node.js 18+
- Docker (for DynamoDB Local)
- AWS CLI (for table setup)

### Setup Commands
```bash
# Start DynamoDB Local
cd e2e && npm run dynamodb:start

# Start backend
cd elixir && ./bin/symphony --port 4000 ./WORKFLOW.md

# Start frontend (dev mode)
cd elixir/assets && npm run dev

# Run tests
cd e2e && npm install && npx playwright install
npm run test:api    # API only
npm run test:e2e    # Browser E2E
npm run test        # All tests
npm run test:perf   # Performance benchmarks
```

---

## 3. Test Scenarios

### Flow 1: Create Task -> Auto-Assign -> Verify Execution

**Objective:** Verify end-to-end task lifecycle from creation to agent execution.

| Step | Action | Expected Result | Test File |
|------|--------|-----------------|-----------|
| 1.1 | POST /api/v1/tasks with title + priority | 201, task with id + status=pending | tasks-crud.spec.ts |
| 1.2 | GET /api/v1/tasks | Created task appears in list | tasks-crud.spec.ts |
| 1.3 | UI: Click "Create Task" button | Form dialog opens | kanban-board.spec.ts |
| 1.4 | UI: Fill title + submit | Task card appears in Pending column | kanban-board.spec.ts |
| 1.5 | System auto-assigns to idle agent | Task moves to In Progress column | kanban-board.spec.ts |
| 1.6 | Agent completes task | Task moves to Completed column | kanban-board.spec.ts |

**Acceptance Criteria:**
- Task creation returns valid JSON with all required fields
- Auto-assignment happens within 10s of creation
- UI reflects state changes without manual refresh

### Flow 2: Drag Task to Agent -> Verify Re-Queue + Execution

**Objective:** Verify manual task reassignment via drag-and-drop.

| Step | Action | Expected Result | Test File |
|------|--------|-----------------|-----------|
| 2.1 | Create task assigned to Agent A | Task shows under Agent A | kanban-board.spec.ts |
| 2.2 | Drag task card to Agent B drop zone | PATCH /api/v1/tasks/:id fires | kanban-board.spec.ts |
| 2.3 | Verify API response | assignee changed to Agent B | tasks-crud.spec.ts |
| 2.4 | Verify Agent B workload incremented | Agent panel updates | kanban-board.spec.ts |
| 2.5 | Verify Agent A workload decremented | Agent panel updates | kanban-board.spec.ts |

**Acceptance Criteria:**
- Drag-and-drop triggers PATCH with new assignee
- Both source and target agent workloads update in <2s
- Task card moves visually without page reload

### Flow 3: Agent Workload Updates Real-Time

**Objective:** Verify SSE-driven real-time agent workload display.

| Step | Action | Expected Result | Test File |
|------|--------|-----------------|-----------|
| 3.1 | Load dashboard | Agent panel shows all agents with workloads | kanban-board.spec.ts |
| 3.2 | Create task via API (not UI) | SSE event fires | sse-realtime.spec.ts |
| 3.3 | Observe UI without refresh | New task appears in Kanban | sse-realtime.spec.ts |
| 3.4 | Assign task to agent via API | Agent workload updates in UI | kanban-board.spec.ts |
| 3.5 | Measure event-to-render latency | < 1000ms | sse-realtime.spec.ts |

**Acceptance Criteria:**
- SSE connection established on page load
- UI updates within 1s of backend state change
- Agent panel reflects current workload accurately

### Flow 4: Task Persists + Survives Restart

**Objective:** Verify DynamoDB persistence layer.

| Step | Action | Expected Result | Test File |
|------|--------|-----------------|-----------|
| 4.1 | Create task via API | Task stored in DynamoDB | persistence.spec.ts |
| 4.2 | Refresh browser page | Task still visible | persistence.spec.ts |
| 4.3 | GET /api/v1/tasks/:id | Same data as creation response | persistence.spec.ts |
| 4.4 | Compare list vs detail endpoint | Fields match exactly | persistence.spec.ts |

**Acceptance Criteria:**
- Task data consistent across list and detail endpoints
- Page refresh does not lose task data
- Updated fields persist immediately

### Flow 5: Search/Filter by Status, Priority, Assignee

**Objective:** Verify filtering and search functionality.

| Step | Action | Expected Result | Test File |
|------|--------|-----------------|-----------|
| 5.1 | GET /api/v1/tasks?status=pending | Only pending tasks returned | tasks-crud.spec.ts |
| 5.2 | GET /api/v1/tasks?priority=critical | Only critical tasks returned | tasks-crud.spec.ts |
| 5.3 | GET /api/v1/tasks?assignee=agent-x | Only agent-x tasks returned | tasks-crud.spec.ts |
| 5.4 | UI: Select status filter | Kanban shows only matching tasks | kanban-board.spec.ts |
| 5.5 | UI: Type in search box | Tasks filtered by title match | kanban-board.spec.ts |

**Acceptance Criteria:**
- API filters return correct subsets
- UI filters update immediately (client-side or re-fetch)
- Search is case-insensitive with debounce

---

## 4. Error Scenarios

| Scenario | Trigger | Expected Behavior | Test File |
|----------|---------|-------------------|-----------|
| Network drop | Browser goes offline | UI shows stale data, no crash | error-scenarios.spec.ts |
| Network restore | Browser comes online | UI recovers, fetches fresh data | error-scenarios.spec.ts |
| Invalid task input | POST with missing title | 422 response, form shows error | error-scenarios.spec.ts |
| Invalid status | PATCH with bad status value | 400/422 response | error-scenarios.spec.ts |
| XSS in title | Task title contains `<script>` | Rendered as text, not executed | error-scenarios.spec.ts |
| Agent offline | Agent with status=offline | Visible indicator in agent panel | error-scenarios.spec.ts |
| 404 issue | GET /api/v1/NONEXISTENT | 404 with error JSON | observability.spec.ts |
| Method not allowed | DELETE /api/v1/state | 405 with error JSON | observability.spec.ts |

---

## 5. Performance Requirements

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| GET /api/v1/state p95 | < 200ms | perf-benchmark.ts |
| GET /api/v1/tasks p95 (100+ tasks) | < 500ms | perf-benchmark.ts |
| POST /api/v1/tasks p95 | < 300ms | perf-benchmark.ts |
| Task creation throughput | > 10 tasks/sec | perf-benchmark.ts |
| SSE event-to-render | < 1000ms | sse-realtime.spec.ts |
| 50 concurrent agent polls | < 1000ms p95 | perf-benchmark.ts |
| Page initial load | < 3s | Lighthouse / manual |

### DynamoDB Capacity Sizing

| Table | RCU (Read) | WCU (Write) | Justification |
|-------|-----------|-------------|---------------|
| symphony-tasks | 10 | 10 | 100 tasks, ~1 read/sec per agent poll |
| symphony-agents | 5 | 5 | 50 agents, infrequent writes |

**GSI indexes:** status-index, priority-index, assignee-index (for filtered queries)

---

## 6. Test Matrix

| Test Suite | Test Count | Requires Backend | Requires Frontend | Requires DynamoDB |
|------------|-----------|-----------------|-------------------|-------------------|
| API: Observability | 7 | Yes | No | No |
| API: Tasks CRUD | 12 | Yes | No | Yes |
| API: Agents | 5 | Yes | No | Yes |
| API: SSE Events | 2 | Yes | No | No |
| E2E: Kanban Board | 10 | Yes | Yes | Yes |
| E2E: Persistence | 3 | Yes | Yes | Yes |
| E2E: SSE Realtime | 3 | Yes | Yes | No |
| E2E: Error Scenarios | 5 | Yes | Yes | No |
| Performance | 6 | Yes | No | Yes |
| **Total** | **53** | | | |

---

## 7. Deployment Readiness Checklist

Before sign-off, all of the following must be true:

- [ ] All API contract tests pass (26 tests)
- [ ] All E2E browser tests pass on Chromium (21 tests)
- [ ] E2E tests pass on Firefox (cross-browser)
- [ ] Performance benchmarks meet targets (6 benchmarks)
- [ ] No XSS vulnerabilities detected
- [ ] Network failure recovery works
- [ ] DynamoDB Local tables created and seeded
- [ ] CI pipeline green (if configured)
- [ ] Performance report generated and reviewed

---

## 8. Files Reference

```
e2e/
  package.json                          # Dependencies
  tsconfig.json                         # TypeScript config
  playwright.config.ts                  # Multi-project Playwright config
  TEST_PLAN.md                          # This document
  docker-compose.yml                    # DynamoDB Local + services
  helpers/
    api-client.ts                       # Typed API client
    test-data.ts                        # Data factories
    wait.ts                             # Wait/timing utilities
  tests/
    api/
      observability.spec.ts             # Existing endpoints
      tasks-crud.spec.ts                # Task CRUD
      agents.spec.ts                    # Agent endpoints
      sse-events.spec.ts               # SSE streaming
    e2e/
      kanban-board.spec.ts              # Flows 1,2,3,5
      persistence.spec.ts              # Flow 4
      sse-realtime.spec.ts             # Real-time SSE
      error-scenarios.spec.ts          # Error handling
  fixtures/
    seed-tasks.json                     # Sample task data
    seed-agents.json                    # Sample agent data
  scripts/
    perf-benchmark.ts                   # Performance harness
    dynamodb-local.sh                   # DynamoDB setup
    seed-data.ts                        # Seed script
```

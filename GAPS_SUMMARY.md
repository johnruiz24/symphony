# Symphony Frontend POC: Gaps & Decisions Summary (Quick Reference)

**This document is a one-page executive summary of gaps found in the specification.**
**For detailed analysis, see `FRONTEND_FLOW_ANALYSIS.md` and `FLOW_DIAGRAMS.md`.**

---

## Quick Stats

| Metric | Count |
|--------|-------|
| Critical Gaps | 5 |
| Important Gaps | 5 |
| Total Gaps Identified | 31 |
| User Flows Analyzed | 5 |
| Edge Cases Identified | 14 |
| Permutations Discovered | 47 |
| **Implementation Blockers** | **5** ← MUST RESOLVE |

---

## The 5 Critical Implementation Blockers

### C1: Agent List API
```
Gap: "Show ALL active agents" - but /api/v1/state doesn't have agents[]
Fix: Decide - New endpoint /api/v1/agents OR add to /api/v1/state?
     What fields? { id, hostname, workload, capacity, status }
Impact: Blocks frontend data fetching, backend API changes
Status: MUST ANSWER before coding
```

### C2: Task Reassignment Endpoint
```
Gap: Drag-drop reassignment works, but no POST endpoint specified
Fix: Endpoint: POST /api/v1/tasks/:id/reassign?
     Request: { agent_id: "agent-2" }
     Response: { success, task, agents, error? }
Impact: Blocks integration between React and Elixir
Status: MUST ANSWER before coding
```

### C3: Real-time Update Mechanism
```
Gap: "Real-time WebSocket sync" - but React needs different protocol than LiveView
Fix: Choose ONE:
     Option A: SSE (Server-Sent Events) - simpler, works everywhere
     Option B: WebSocket + Socket.io - lower latency, more complex
     Option C: Polling (/api/v1/state every 5-30s) - simple, less real-time
Impact: Major frontend architecture decision
Status: MUST ANSWER before coding
```

### C4: Task Lifecycle
```
Gap: No clear state machine. Who creates tasks? Are they persisted?
Fix: Define:
     - Full state: discovered → queued → running → completed → archived
     - Who creates: Tracker only? Or frontend API too?
     - Persistence: DynamoDB? GenServer only?
     - TTL for completed tasks (1 hour? 1 day?)
Impact: Affects data model, persistence strategy
Status: MUST ANSWER before coding
```

### C5: Agent Capacity Model
```
Gap: "Available agent" not defined. Capacity calculation unclear.
Fix: Define:
     - How is capacity calculated per agent?
     - Can you drag to a full agent? (queued or error?)
     - Can users force-assign?
Impact: Affects drag-drop validation, queue management
Status: MUST ANSWER before coding
```

---

## The 5 Important Decisions

### I1: Reassign Running Tasks?
```
Decision: Can users drag tasks that are currently executing?
A: NO - Only queued tasks can be reassigned (simpler, safer)
B: YES - Pre-empt execution, then reassign (complex, risk of data loss)
Recommendation: A (NO)
Reason: Pre-emption adds significant complexity; safer to only reassign queued
```

### I2: Network Error Recovery
```
Decision: When drag-drop POST times out (5s), what happens?
A: Auto-retry 3x with backoff (transparent to user, but slow)
B: Show error, user clicks retry button (explicit, user has control)
C: Optimistic update, accept divergence, full reconciliation later (risky)
Recommendation: B (show error, let user retry)
Reason: Balance between UX and error transparency
```

### I3: Agent Crash Detection
```
Decision: When agent crashes during task execution?
A: Quick recovery (< 5s), move task to retry queue, mark agent offline temporarily
B: Slow recovery (wait for timeout, > 30s), then retry
C: No auto-recovery, require manual intervention
Recommendation: A (quick recovery)
Reason: User expects fast failure detection and recovery in long-running systems
```

### I4: Filter Persistence
```
Decision: Should filters persist across browser sessions?
A: YES - Store in localStorage (convenient for power users)
B: NO - Reset on page load (simplest implementation)
C: BOTH - Persist to URL params for bookmarking
Recommendation: C (URL params only, no localStorage)
Reason: Bookmarking filtered views is more useful than session-persist
```

### I5: Large-Scale Handling
```
Decision: With 1000+ tasks or 50+ agents, how to handle?
A: Virtual scrolling + pagination (complex but scales)
B: Server-side filtering/pagination (simpler, requires API changes)
C: Limit display (max 100 tasks, max 10 agents showing)
Recommendation: A (virtual scrolling for tasks, horizontal scroll for agents)
Reason: User should see all agents; tasks can be virtualized
```

---

## Unspecified Error Scenarios (14 Critical)

| Scenario | Current Spec | Impact |
|----------|---|---|
| All agents at capacity | Not specified | What do users see? Error? Queue? |
| Agent crashes mid-task | Not specified | Auto-recover? Show error? |
| Network timeout on reassign | Not specified | Retry? Rollback? Manual? |
| Task deleted while reassigning | Not specified | 404 error? Graceful fail? |
| Agent goes offline during drag | Not specified | Prevent drop? Show warning? |
| DynamoDB unavailable | Not specified | Orchestrator falls back how? |
| Orchestrator crashed | Not specified | Frontend detects how? |
| SSE connection drops | Not specified | Fall back to polling? Auto-reconnect? |
| Concurrent reassignments (same task) | Not specified | Last-write-wins or conflict? |
| Task reassignment fails race condition | Not specified | Retry? Reconciliation? |
| Frontend shows stale state (missed SSE) | Not specified | Periodic reconciliation? |
| Agent offline but still showing in UI | Not specified | When is it removed? 5s? 30s? |
| Very slow network (5s+ latency) | Not specified | User perceives stuck UI? |
| Large task list (1000+ items) | Not specified | Pagination? Virtualization? |

---

## Missing Acceptance Criteria

### Current Spec Says (✓)
- [✓] All active agents displayed with workload cards
- [✓] Drag-drop task assignment to agents
- [✓] Real-time WebSocket sync for task updates
- [✓] Frontend restart → reconnect to Elixir, fetch latest state
- [✓] Filter/search tasks by status, priority, assignee

### Missing from Spec (✗)
- [ ] What is an "active" agent? (Definition unclear)
- [ ] What is drag-drop "validation"? (Rules not specified)
- [ ] What is "real-time"? (Latency SLA not specified - 100ms? 1s? 5s?)
- [ ] What is "latest state"? (Reconciliation strategy not specified)
- [ ] What filters are available? (Dimensions not enumerated)
- [ ] Error handling for all failure scenarios
- [ ] Performance requirements (max tasks, max agents, update frequency)
- [ ] Security & auth model (who can create/reassign tasks?)
- [ ] Scalability targets (designed for how many tasks/agents?)

---

## Implementation Roadmap (5 Phases)

### Phase 1: Specification Clarity (1-2 days) ← **START HERE**
```
MUST DO:
  [ ] Answer 5 Critical questions (C1-C5)
  [ ] Decide on 5 Important decisions (I1-I5)
  [ ] Create API spec document
  [ ] Define error handling for 14 scenarios
  [ ] Enumerate all filters + validation rules
  [ ] Get stakeholder sign-off

DELIVERABLE: Updated spec document (sign-off required before Phase 2)
```

### Phase 2: Backend API (1-2 days)
```
MUST DO:
  [ ] Add agents[] to /api/v1/state (or create /api/v1/agents)
  [ ] Implement POST /api/v1/tasks/:id/reassign endpoint
  [ ] Set up SSE /api/v1/events stream (or choose polling/WebSocket)
  [ ] Add validation + error responses
  [ ] Unit + integration tests
  [ ] API documentation

DELIVERABLE: Stable backend API with error handling
```

### Phase 3: React Frontend Structure (2-3 days)
```
MUST DO:
  [ ] Set up React + TypeScript + Vite
  [ ] Create component hierarchy (as in FLOW_DIAGRAMS.md)
  [ ] Implement state management (Redux/Zustand/Context)
  [ ] Implement real-time update handler (SSE listener)
  [ ] Add error boundary + error recovery
  [ ] Unit tests for components

DELIVERABLE: Functional frontend structure (not styled yet)
```

### Phase 4: UI Implementation (2-3 days)
```
MUST DO:
  [ ] Mini-dashboard agent cards (with workload gauge)
  [ ] Task table (with filters)
  [ ] Drag-drop interaction (with validation)
  [ ] Error states (with user-friendly messages)
  [ ] Loading states (spinners, skeletons)
  [ ] Styling (use existing dashboard.css as guide)

DELIVERABLE: Fully styled, interactive UI
```

### Phase 5: Integration & Testing (2-3 days)
```
MUST DO:
  [ ] E2E testing (task creation → assignment → execution)
  [ ] Error injection testing (crashes, timeouts)
  [ ] Performance testing (large lists, many agents)
  [ ] Accessibility audit (keyboard nav, color contrast)
  [ ] Manual UAT with real backend
  [ ] Documentation (README, deployment guide)

DELIVERABLE: Production-ready frontend
```

**Total Effort:** ~10-14 days (2-3 weeks)
**Critical Path:** Phase 1 (spec clarity) must complete before Phase 2 starts

---

## File References

| Document | Purpose |
|----------|---------|
| `FRONTEND_FLOW_ANALYSIS.md` | Complete detailed analysis (12 sections) |
| `FLOW_DIAGRAMS.md` | Visual flows, state machines, sequence diagrams |
| `GAPS_SUMMARY.md` | **← You are here** (quick reference) |
| `ARCHITECTURE.md` | Current Elixir architecture (for context) |
| `FRONTEND_PATTERNS_CHECKLIST.md` | React integration best practices |
| `REACT_INTEGRATION_PLAN.md` | Current integration strategy |

---

## Checklist: Before Implementation Starts

- [ ] All 5 Critical questions answered (C1-C5)
- [ ] All 5 Important decisions made (I1-I5)
- [ ] API specification document created + reviewed
- [ ] Error handling plan for 14 scenarios
- [ ] Performance requirements defined
- [ ] Security model defined (auth, permissions)
- [ ] Acceptance criteria enumerated
- [ ] Stakeholders sign off on spec
- [ ] **ONLY THEN:** Begin Phase 2 (backend API)

---

## Risk Summary

### High Risk
```
1. Unspecified API contract (C1, C2)
   → Could cause major rework if wrong

2. Real-time mechanism unclear (C3)
   → Different choices have very different implications

3. Error handling not specified (14 scenarios)
   → Production incidents likely if not handled
```

### Medium Risk
```
1. Scalability limits unknown (1000+ tasks, 50+ agents)
   → May hit performance wall later

2. Concurrency model unclear (race conditions possible)
   → Hard to debug in production
```

### Low Risk
```
1. UI/UX details (animations, colors)
   → Can iterate on once working

2. Performance optimization
   → Can improve later (virtual scrolling, caching)
```

---

## Next Steps (What to Do Now)

### Immediately
1. **Read** `FRONTEND_FLOW_ANALYSIS.md` (sections 1-5)
2. **Review** 5 Critical questions (C1-C5) with team
3. **Schedule** stakeholder meeting to answer critical questions

### This Week
4. **Create** spec document with decisions (from Phase 1)
5. **Get** sign-off on API contract
6. **Design** error handling strategy
7. **Begin** Phase 2 (backend API work)

### Success Criteria
- Specification is complete, unambiguous, approved
- API contract is defined with examples
- Error scenarios handled (docs + code)
- Team confident implementation won't need rework

---

**Document Status:** Ready for review
**Confidence Level:** HIGH (based on detailed analysis of all flows/edge cases)
**Recommendation:** Complete Phase 1 (clarity) before any coding starts

**Created:** March 18, 2026

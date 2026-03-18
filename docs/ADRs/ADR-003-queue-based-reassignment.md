# ADR-003: Queue-Based Reassignment (No Capacity Blocking)

**Status:** Accepted
**Date:** 2026-03-18
**Context:** Symphony orchestrator dispatch and retry strategy

---

## Context

Symphony's orchestrator manages multiple concurrent agent sessions. Key operational scenarios include:

1. **Agent failure** -- A Codex session crashes or times out
2. **Issue state change** -- A human moves an issue to a terminal state while an agent is working
3. **Capacity limits** -- More eligible issues exist than `max_concurrent_agents` allows
4. **Transient errors** -- Network issues, rate limits, or temporary service unavailability

The orchestrator must handle all of these without blocking other work or requiring manual intervention.

---

## Decision

Use a **queue-based reassignment model with exponential backoff** where failed or displaced agent sessions enter a retry queue rather than blocking dispatch capacity.

---

## Rationale

### 1. No capacity blocking

When an agent session fails, the issue enters the retry queue with a backoff timer. Critically, **retry queue entries do not count against `max_concurrent_agents`**. This means:

- A burst of failures does not reduce the orchestrator's capacity to start new work
- Healthy issues continue to be dispatched while failed ones wait for retry
- The system degrades gracefully under partial failure

If retries counted against capacity, a cascade of failures could starve the system -- 10 concurrent slots all occupied by retrying issues, with no room for new work.

### 2. Exponential backoff prevents thundering herd

Failed issues retry with exponential backoff:
- Attempt 1: immediate (or short delay)
- Attempt 2: longer delay
- Attempt N: exponentially increasing delay

This prevents:
- Rapid retry loops that waste resources on persistent failures
- Thundering herd when a transient issue resolves (staggered retries)
- API rate limit exhaustion from aggressive retries

### 3. Clean separation of running and retrying state

The orchestrator maintains two distinct collections:
- `running` -- Active agent sessions consuming capacity
- `retrying` -- Queued issues waiting for their next attempt

This separation is reflected in the API (`/api/v1/state` returns both lists) and the dashboard (separate visual sections). Operators can immediately see:
- How many agents are actively working
- How many issues are waiting to retry
- What errors caused the retries
- When each retry is scheduled

### 4. Reconciliation handles external state changes

The orchestrator periodically reconciles its internal state against the issue tracker:
- If an issue moved to a terminal state externally, the running agent is stopped
- If a retrying issue was resolved externally, it is removed from the retry queue
- New eligible issues are discovered and dispatched

This reconciliation loop is independent of the retry mechanism, ensuring the orchestrator never works on stale or irrelevant issues.

### 5. Issue tracker remains the source of truth

The queue-based model reinforces a key architectural principle: the issue tracker (Linear, Jira) is the canonical source of truth for issue state. Symphony's internal queues are operational state only -- they can be reconstructed from scratch by re-polling the tracker.

This is why Symphony supports restart recovery without a persistent database: on restart, it polls the tracker, discovers active issues, and begins dispatching. No retry queue needs to survive a restart.

---

## Consequences

### Positive
- System remains productive even when some issues are failing
- Operators see clear status: running vs. retrying vs. healthy
- No manual intervention needed for transient failures
- Restart recovery is simple (re-poll tracker, no queue persistence needed)

### Negative
- Issues with persistent failures accumulate in the retry queue until manually addressed
- Backoff delays mean some issues wait longer than strictly necessary after a transient fix
- The retry queue can grow unbounded if many issues have persistent failures

### Mitigations
- `max_turns` caps the number of retry attempts per issue
- Terminal state reconciliation automatically cleans up issues that are resolved externally
- The API and dashboard expose retry state for operator visibility

---

## How It Works in Practice

### Dispatch Cycle

```
1. Poll tracker for eligible issues
2. For each eligible issue NOT already running or retrying:
   a. If running_count < max_concurrent_agents:
      - Create workspace
      - Launch agent session
      - Add to running set
   b. Else: skip (will be picked up next poll cycle)
3. For each retrying issue whose backoff timer has expired:
   a. If running_count < max_concurrent_agents:
      - Re-launch agent session
      - Move from retrying to running
4. Reconcile: check running issues against tracker state
   - Stop agents for issues now in terminal states
```

### Failure Handling

```
Agent session fails:
  1. Remove from running set (frees capacity slot)
  2. Calculate backoff: base_delay * 2^(attempt - 1)
  3. Add to retry queue with due_at timestamp
  4. Log error details for observability

Next poll cycle:
  - New eligible issues can use the freed capacity
  - Retrying issue waits for its backoff timer
```

### API Visibility

The `/api/v1/state` endpoint exposes both sets:

```json
{
  "counts": { "running": 8, "retrying": 2 },
  "running": [ ... active sessions ... ],
  "retrying": [
    {
      "issue_identifier": "PROJ-99",
      "attempt": 3,
      "due_at": "2026-03-18T12:15:00Z",
      "error": "Codex session timed out after 20 turns"
    }
  ]
}
```

---

## Alternatives Considered

### Blocking retry (count retries against capacity)
Rejected because a burst of failures would starve the system, preventing new work from starting.

### Immediate retry (no backoff)
Rejected because persistent failures would cause tight retry loops, wasting resources and potentially hitting rate limits.

### Dead letter queue (give up after N attempts)
Partially adopted: `max_turns` limits total agent turns, but the issue remains retryable as long as it is in an active state in the tracker. The orchestrator defers to the tracker for the ultimate "give up" decision (human moves issue to Cancelled).

### External job queue (Redis, RabbitMQ, SQS)
Rejected because it adds infrastructure complexity without meaningful benefit. The in-memory retry queue is simple, the tracker is the source of truth, and restart recovery re-derives the queue from the tracker.

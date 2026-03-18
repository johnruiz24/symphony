# Production Readiness Checklist - Symphony Frontend POC Backend

**Date:** 2026-03-18
**Status:** POC (local development)

## Backend Readiness

### Code Quality

- [x] All public functions have `@spec` type annotations
- [x] All modules have `@moduledoc`
- [x] Adapter pattern for task storage (swap memory/DynamoDB)
- [x] Presenter layer separates serialization from controllers
- [x] PubSub for SSE event broadcasting
- [ ] Fallback controller for shared error handling (currently duplicated `error_response/4`)
- [ ] Input validation for field lengths (title: 255, description: 4096)
- [ ] Whitelist allowed update fields in TaskStore.Memory

### API Correctness

- [x] OpenAPI 3.1 specification (`docs/api-specification-v1.yaml`)
- [x] All 7 endpoints implemented (health, tasks CRUD, reassign, agents, events)
- [x] SSE streaming with heartbeat
- [x] Response envelope `{ data, meta }` for list endpoints
- [x] Error format `{ error: { code, message } }`
- [x] Task state machine: backlog -> todo -> in_progress -> done
- [ ] State machine transition validation in update (currently allows any transition)
- [ ] Optimistic locking (version check on PATCH) -- spec requires, not yet implemented
- [ ] Pagination support (cursor-based) -- spec defines, not yet implemented

### Security (from security-review.md)

- [ ] **H1:** Fix `String.to_existing_atom/1` crash on unknown fields
- [ ] **H2:** Remove wildcard CORS on SSE endpoint
- [ ] **M1:** Add DELETE to CORS allowed methods
- [ ] **M2:** Add input length validation
- [ ] **L1:** Stop leaking internal errors via `inspect(reason)`
- [ ] **L2:** Change heartbeat to 15s (from 30s)
- [x] CORS origin configurable via application env
- [x] No hardcoded secrets
- [x] No SQL injection vectors (DynamoDB SDK)

### Testing

- [ ] Controller unit tests (ConnCase)
- [ ] TaskStore.Memory unit tests
- [ ] TaskPresenter unit tests
- [ ] SSE integration test (connect, receive events)
- [ ] PubSub integration test (broadcast -> receive)
- [ ] Error handling tests (404, 422, 503)

### Observability

- [x] Health endpoint (`GET /api/v1/health`)
- [x] Orchestrator status in health check
- [ ] Structured logging (currently uses `inspect/1` in errors)
- [ ] Request logging middleware (log method, path, status, duration)
- [ ] SSE connection count metric

### Infrastructure

- [ ] DynamoDB table created in mll-sandbox (eu-central-1)
- [ ] DynamoDB adapter implemented (only Memory adapter exists)
- [x] PubSub configured and working
- [x] Router correctly ordered (new routes before catch-all)
- [ ] Graceful SSE connection cleanup on server shutdown
- [ ] TaskStore.Memory added to supervision tree

---

## What's Ready for POC Demo

The backend is functional for local development:

1. **Task CRUD works** -- create, read, update, delete tasks via REST API
2. **Agent listing works** -- reads from Orchestrator snapshot
3. **SSE streaming works** -- real-time events via PubSub
4. **Health check works** -- liveness probe
5. **CORS configured** -- React on :3000 can talk to Elixir on :4000
6. **In-memory store** -- no DynamoDB dependency for dev/demo

## What Needs Work Before Production

1. DynamoDB adapter (the spec defines it, only Memory exists)
2. Optimistic locking (version field exists but not enforced)
3. Security fixes (H1, H2 from security review)
4. Input validation (lengths, allowed fields)
5. Rate limiting
6. Authentication (not scoped for POC)
7. Test coverage

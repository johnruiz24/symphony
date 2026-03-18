# ADR-001: Why SSE over WebSocket for Frontend Real-Time Updates

**Status:** Accepted
**Date:** 2026-03-18
**Context:** Symphony Frontend POC real-time communication strategy

---

## Context

The Symphony Frontend POC needs real-time updates from the backend to display:
- Agent session status changes (started, running, completed, failed)
- Token usage counters updating live
- Retry queue changes and backoff timers
- Orchestrator state transitions

We evaluated two primary options for delivering these updates to the browser:
1. **Server-Sent Events (SSE)** -- Unidirectional server-to-client stream over HTTP
2. **WebSocket** -- Bidirectional persistent connection

The existing Elixir backend already uses Phoenix LiveView (which uses WebSocket internally) for its built-in dashboard. The question is what protocol the new React frontend should use.

---

## Decision

Use **Server-Sent Events (SSE)** as the primary real-time transport for the React frontend.

---

## Rationale

### 1. Unidirectional data flow matches our use case

Symphony's frontend is primarily a monitoring dashboard. The data flow is overwhelmingly server-to-client:
- Orchestrator state snapshots flow out
- Agent event streams flow out
- The only client-to-server actions are "refresh" (triggerable via simple POST)

SSE's one-way model is a natural fit. WebSocket's bidirectional capability would be unused overhead.

### 2. Simpler infrastructure and proxy compatibility

SSE runs over standard HTTP/1.1 and HTTP/2. This means:
- Standard HTTP caching, compression, and authentication work naturally
- Reverse proxies (nginx, Cloudflare, ALBs) handle SSE without special configuration
- No need for WebSocket upgrade negotiation or sticky sessions
- HTTP/2 multiplexing allows multiple SSE streams over a single TCP connection

### 3. Automatic reconnection built into the EventSource API

The browser's `EventSource` API provides:
- Automatic reconnection with configurable retry intervals
- Last-Event-ID header for resumption after disconnect
- No custom reconnection logic needed in application code

WebSocket reconnection requires manual implementation or a library like Socket.IO.

### 4. Coexists with the existing Phoenix LiveView dashboard

The Elixir backend's built-in dashboard uses Phoenix LiveView (WebSocket). The new React frontend's SSE endpoint can coexist without interfering:
- Different transport protocols avoid port/connection conflicts
- Each can be developed and deployed independently
- The SSE endpoint is a simple Phoenix controller, not a LiveView

### 5. Easier to debug and monitor

SSE streams are plain-text HTTP responses visible in:
- Browser DevTools Network tab (appears as a standard request)
- curl for manual testing: `curl http://localhost:4000/api/v1/events`
- Standard HTTP access logs

WebSocket frames require specialized tooling to inspect.

---

## Consequences

### Positive
- Simpler client code (native `EventSource` API, no WS library needed)
- Better proxy/CDN compatibility for future deployment
- Automatic reconnection without custom logic
- Standard HTTP semantics for auth, caching, CORS

### Negative
- Cannot send messages client-to-server over the same connection (use separate POST endpoints)
- Maximum of ~6 concurrent SSE connections per domain in HTTP/1.1 (mitigated by HTTP/2)
- No binary frame support (not needed for JSON payloads)

### Risks
- If bidirectional communication becomes necessary (e.g., interactive agent control), we would need to add WebSocket support or switch protocols
- Some older corporate proxies may buffer SSE streams (mitigated by `X-Accel-Buffering: no` header)

---

## Alternatives Considered

### WebSocket
Rejected because bidirectional communication is not needed and adds complexity in proxy configuration, reconnection logic, and debugging.

### Polling
Rejected because polling introduces latency (interval-dependent) and unnecessary load on the backend. The existing `/api/v1/state` endpoint supports polling as a fallback but should not be the primary mechanism.

### Phoenix LiveView for React
Rejected because LiveView is tightly coupled to the HEEx template engine and Elixir server rendering. Using it from a standalone React app would require the `phoenix` and `phoenix_live_view` JS packages plus custom hook wiring, adding complexity without benefit.

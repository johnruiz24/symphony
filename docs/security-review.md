# Security Review - Symphony Frontend POC Backend

**Reviewer:** backend-architect
**Date:** 2026-03-18
**Scope:** All new Elixir controllers, TaskStore, SSE, CORS, Router

## Summary

The backend implementation is solid for a POC with a few issues to address.
**2 HIGH**, **3 MEDIUM**, **2 LOW** severity findings.

---

## HIGH Severity

### H1: `String.to_existing_atom/1` in TaskStore.Memory can crash on unknown keys

**File:** `elixir/lib/symphony_elixir/task_store/memory.ex:76`

```elixir
atom_key = if is_binary(key), do: String.to_existing_atom(key), else: key
```

**Risk:** If a client sends an unexpected field name (e.g., `"foo": "bar"`),
`String.to_existing_atom/1` raises `ArgumentError` because `:foo` doesn't
exist as an atom. This crashes the controller process.

**Impact:** Any PATCH request with an unknown field name causes a 500 error.
An attacker can craft requests to repeatedly crash the process.

**Fix:** Use a whitelist of allowed fields instead:

```elixir
@updatable_fields ~w(title description status priority assigned_agent tags source)

defp apply_update(task, attrs) do
  attrs
  |> Map.take(@updatable_fields)
  |> Enum.reduce(task, fn {key, value}, acc ->
    Map.put(acc, String.to_existing_atom(key), value)
  end)
end
```

### H2: SSE EventController sets `access-control-allow-origin: *` (wildcard)

**File:** `elixir/lib/symphony_elixir_web/controllers/event_controller.ex:22`

```elixir
|> put_resp_header("access-control-allow-origin", "*")
```

**Risk:** The SSE endpoint allows any origin to connect, bypassing the
restrictive CORS policy defined in `CorsPlug`. An attacker hosting a
malicious page could subscribe to the SSE stream and observe all task/agent
state changes.

**Impact:** Information disclosure. All task titles, descriptions, agent
workload, and status transitions are visible to any origin.

**Fix:** Remove the hardcoded wildcard. The `CorsPlug` in the `:api_cors`
pipeline already handles CORS for this route. Remove line 22:

```elixir
# DELETE THIS LINE:
|> put_resp_header("access-control-allow-origin", "*")
```

---

## MEDIUM Severity

### M1: CORS plug missing DELETE method

**File:** `elixir/lib/symphony_elixir_web/cors_plug.ex:28`

```elixir
|> put_resp_header("access-control-allow-methods", "GET, POST, PATCH, OPTIONS")
```

**Risk:** DELETE /api/v1/tasks/:id will fail from the frontend because the
browser's preflight OPTIONS check won't include DELETE in allowed methods.

**Fix:** Add DELETE:

```elixir
|> put_resp_header("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS")
```

### M2: No input length validation on create/update

**File:** `elixir/lib/symphony_elixir_web/controllers/task_controller.ex:43-66`

**Risk:** The API spec defines `title` max 255 chars and `description` max
4096 chars, but the controller doesn't enforce these limits. A client could
send a 10MB title string, consuming memory and potentially DynamoDB item
size limits (400KB max).

**Fix:** Add length validation in the controller:

```elixir
defp validate_lengths(params) do
  title = Map.get(params, "title", "")
  desc = Map.get(params, "description", "")

  cond do
    byte_size(title) > 255 -> {:error, {:field_too_long, "title", 255}}
    byte_size(desc) > 4096 -> {:error, {:field_too_long, "description", 4096}}
    true -> :ok
  end
end
```

### M3: No rate limiting on task creation

**Risk:** Without rate limiting, a client can flood POST /api/v1/tasks and
create thousands of tasks, exhausting DynamoDB write capacity and filling
the in-memory store.

**POC Accept:** Acceptable for POC (local dev only). Document for production.

**Production Fix:** Add a Plug-based rate limiter or use
`Hammer` (Elixir rate limiting library).

---

## LOW Severity

### L1: Error responses leak internal details via `inspect(reason)`

**File:** `elixir/lib/symphony_elixir_web/controllers/task_controller.ex:24,38,64,88,103,127`

```elixir
error_response(conn, 503, "task_store_error", "Failed to list tasks: #{inspect(reason)}")
```

**Risk:** `inspect(reason)` could expose internal module names, stack traces,
or DynamoDB error details to the client.

**Fix:** Log the full error internally, return a generic message:

```elixir
Logger.error("TaskStore error: #{inspect(reason)}")
error_response(conn, 503, "task_store_error", "Task service temporarily unavailable")
```

### L2: SSE heartbeat interval is 30s (spec says 15s)

**File:** `elixir/lib/symphony_elixir_web/controllers/event_controller.ex:13`

```elixir
@heartbeat_interval_ms 30_000
```

**Risk:** 30-second intervals may cause proxy/load balancer timeouts
(common default: 60s, some as low as 30s). The architecture spec
recommends 15 seconds.

**Fix:** Change to `15_000`.

---

## Positive Findings

1. **Adapter pattern** (`TaskStore` behaviour) is well-designed -- allows
   swapping memory/DynamoDB without controller changes.
2. **PubSub properly guarded** -- `TaskEventPubSub.broadcast_event/2`
   checks if PubSub is alive before broadcasting (line 17).
3. **Router ordering correct** -- New `/api/v1` routes are placed before
   the catch-all `/*path` route.
4. **Presenters separate from controllers** -- `TaskPresenter` handles
   serialization, keeping controllers focused on HTTP concerns.
5. **CORS origin configurable** via application env (`cors_origin`).

---

## OWASP Top 10 Checklist

| # | Vulnerability | Status | Notes |
|---|--------------|--------|-------|
| A01 | Broken Access Control | N/A | No auth for POC (local dev) |
| A02 | Cryptographic Failures | OK | No secrets in responses |
| A03 | Injection | OK | No SQL/NoSQL injection vectors (DynamoDB SDK handles escaping) |
| A04 | Insecure Design | OK | Adapter pattern, proper separation |
| A05 | Security Misconfiguration | **WARN** | H2 (wildcard CORS on SSE) |
| A06 | Vulnerable Components | OK | Phoenix/Plug are current |
| A07 | Auth Failures | N/A | No auth for POC |
| A08 | Data Integrity Failures | OK | Version field for optimistic locking |
| A09 | Logging & Monitoring | **WARN** | L1 (leaking internal errors) |
| A10 | SSRF | OK | No external URL fetching |

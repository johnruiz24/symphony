# Symphony API Reference

The Symphony observability API provides JSON endpoints for monitoring orchestrator state, querying individual issues, and triggering manual refreshes. The API is served by Phoenix when Symphony is started with the `--port` flag.

## Base URL

```
http://localhost:<port>/api/v1
```

Start Symphony with the `--port` flag to enable the API:

```bash
./bin/symphony ./WORKFLOW.md --port 4000
```

---

## Endpoints

### GET /api/v1/state

Returns the full orchestrator snapshot including all running and retrying issues, token usage totals, and rate limit status.

**Request:**

```bash
curl http://localhost:4000/api/v1/state
```

**Response (200 OK):**

```json
{
  "generated_at": "2026-03-18T12:00:00Z",
  "counts": {
    "running": 3,
    "retrying": 1
  },
  "running": [
    {
      "issue_id": "abc-123-uuid",
      "issue_identifier": "PROJ-42",
      "state": "In Progress",
      "worker_host": null,
      "workspace_path": "/home/user/code/workspaces/PROJ-42",
      "session_id": "session-uuid",
      "turn_count": 5,
      "last_event": "agent.tool_call",
      "last_message": "Running tests...",
      "started_at": "2026-03-18T11:30:00Z",
      "last_event_at": "2026-03-18T11:59:45Z",
      "tokens": {
        "input_tokens": 45000,
        "output_tokens": 12000,
        "total_tokens": 57000
      }
    }
  ],
  "retrying": [
    {
      "issue_id": "def-456-uuid",
      "issue_identifier": "PROJ-99",
      "attempt": 2,
      "due_at": "2026-03-18T12:05:00Z",
      "error": "Agent process exited unexpectedly",
      "worker_host": null,
      "workspace_path": "/home/user/code/workspaces/PROJ-99"
    }
  ],
  "codex_totals": {
    "input_tokens": 150000,
    "output_tokens": 50000,
    "total_tokens": 200000
  },
  "rate_limits": {}
}
```

**Error Response (snapshot timeout):**

```json
{
  "generated_at": "2026-03-18T12:00:00Z",
  "error": {
    "code": "snapshot_timeout",
    "message": "Snapshot timed out"
  }
}
```

---

### GET /api/v1/:issue_identifier

Returns detailed information about a specific issue by its human-readable identifier (e.g., `PROJ-42`).

**Request:**

```bash
curl http://localhost:4000/api/v1/PROJ-42
```

**Response (200 OK):**

```json
{
  "issue_identifier": "PROJ-42",
  "issue_id": "abc-123-uuid",
  "status": "running",
  "workspace": {
    "path": "/home/user/code/workspaces/PROJ-42",
    "host": null
  },
  "attempts": {
    "restart_count": 0,
    "current_retry_attempt": 0
  },
  "running": {
    "worker_host": null,
    "workspace_path": "/home/user/code/workspaces/PROJ-42",
    "session_id": "session-uuid",
    "turn_count": 5,
    "state": "In Progress",
    "started_at": "2026-03-18T11:30:00Z",
    "last_event": "agent.tool_call",
    "last_message": "Running tests...",
    "last_event_at": "2026-03-18T11:59:45Z",
    "tokens": {
      "input_tokens": 45000,
      "output_tokens": 12000,
      "total_tokens": 57000
    }
  },
  "retry": null,
  "logs": {
    "codex_session_logs": []
  },
  "recent_events": [
    {
      "at": "2026-03-18T11:59:45Z",
      "event": "agent.tool_call",
      "message": "Running tests..."
    }
  ],
  "last_error": null,
  "tracked": {}
}
```

**Response (404 Not Found):**

```json
{
  "error": {
    "code": "issue_not_found",
    "message": "Issue not found"
  }
}
```

**Status field values:**
- `"running"` -- Issue has an active agent session
- `"retrying"` -- Issue is in the retry queue awaiting next attempt

---

### POST /api/v1/refresh

Triggers an immediate poll cycle in the orchestrator, bypassing the normal polling interval.

**Request:**

```bash
curl -X POST http://localhost:4000/api/v1/refresh
```

**Response (202 Accepted):**

```json
{
  "requested_at": "2026-03-18T12:00:00Z"
}
```

**Response (503 Service Unavailable):**

```json
{
  "error": {
    "code": "orchestrator_unavailable",
    "message": "Orchestrator is unavailable"
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "code": "<error_code>",
    "message": "<human_readable_message>"
  }
}
```

### Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 404 | `not_found` | Route does not exist |
| 404 | `issue_not_found` | Issue identifier not found in orchestrator state |
| 405 | `method_not_allowed` | HTTP method not supported for this route |
| 503 | `orchestrator_unavailable` | Orchestrator process is not responding |

---

## Web Dashboard

### GET /

The root path serves a Phoenix LiveView dashboard when accessed from a browser. The dashboard provides real-time visibility into:

- Active agent sessions with turn counts and token usage
- Retry queue with backoff timers and error details
- Aggregate token consumption across all sessions
- Rate limit status

The dashboard updates in real-time via Phoenix PubSub -- no polling or refresh needed.

### Static Assets

The dashboard loads its assets from these vendored paths:

| Path | Asset |
|------|-------|
| `/dashboard.css` | Dashboard stylesheet |
| `/vendor/phoenix_html/phoenix_html.js` | Phoenix HTML helpers |
| `/vendor/phoenix/phoenix.js` | Phoenix WebSocket client |
| `/vendor/phoenix_live_view/phoenix_live_view.js` | LiveView client runtime |

---

## Route Summary

| Method | Path | Controller Action | Description |
|--------|------|-------------------|-------------|
| GET | `/` | `DashboardLive :index` | LiveView dashboard (browser) |
| GET | `/api/v1/state` | `ObservabilityApiController :state` | Full orchestrator state |
| GET | `/api/v1/:issue_identifier` | `ObservabilityApiController :issue` | Single issue detail |
| POST | `/api/v1/refresh` | `ObservabilityApiController :refresh` | Trigger immediate poll |
| GET | `/dashboard.css` | `StaticAssetController :dashboard_css` | Dashboard styles |
| GET | `/vendor/phoenix_html/phoenix_html.js` | `StaticAssetController :phoenix_html_js` | Phoenix HTML JS |
| GET | `/vendor/phoenix/phoenix.js` | `StaticAssetController :phoenix_js` | Phoenix JS |
| GET | `/vendor/phoenix_live_view/phoenix_live_view.js` | `StaticAssetController :phoenix_live_view_js` | LiveView JS |

All other routes return 404 with the standard error response format.

---

## Configuration

The API timeout for orchestrator snapshots defaults to 15 seconds. This is configured in the Phoenix endpoint configuration:

```elixir
# config/config.exs
config :symphony_elixir, SymphonyElixirWeb.Endpoint,
  snapshot_timeout_ms: 15_000
```

The API server uses Bandit as the HTTP adapter and runs on the port specified via `--port` CLI flag. When `--port` is not provided, the HTTP server does not start.

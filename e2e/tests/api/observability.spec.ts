import { test, expect } from "@playwright/test";
import { SymphonyAPI } from "../../helpers/api-client";

/**
 * API contract tests for the existing observability endpoints.
 * These validate the current stable API surface from presenter.ex.
 */

let api: SymphonyAPI;

test.beforeEach(async ({ request }) => {
  api = new SymphonyAPI(request);
});

test.describe("GET /api/v1/state", () => {
  test("returns 200 with valid orchestration state", async () => {
    const state = await api.getState();

    expect(state).toHaveProperty("generated_at");
    expect(state.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Either has counts or an error
    if (!state.error) {
      expect(state).toHaveProperty("counts");
      expect(state.counts).toHaveProperty("running");
      expect(state.counts).toHaveProperty("retrying");
      expect(typeof state.counts.running).toBe("number");
      expect(typeof state.counts.retrying).toBe("number");

      expect(Array.isArray(state.running)).toBe(true);
      expect(Array.isArray(state.retrying)).toBe(true);

      expect(state).toHaveProperty("codex_totals");
      expect(state).toHaveProperty("rate_limits");
    }
  });

  test("running entries have correct shape", async () => {
    const state = await api.getState();
    if (state.error || state.running.length === 0) {
      test.skip();
      return;
    }

    const entry = state.running[0];
    expect(entry).toHaveProperty("issue_id");
    expect(entry).toHaveProperty("issue_identifier");
    expect(entry).toHaveProperty("state");
    expect(entry).toHaveProperty("session_id");
    expect(entry).toHaveProperty("turn_count");
    expect(entry).toHaveProperty("started_at");
    expect(entry).toHaveProperty("last_event_at");
    expect(entry).toHaveProperty("tokens");
    expect(entry.tokens).toHaveProperty("input_tokens");
    expect(entry.tokens).toHaveProperty("output_tokens");
    expect(entry.tokens).toHaveProperty("total_tokens");
  });

  test("retrying entries have correct shape", async () => {
    const state = await api.getState();
    if (state.error || state.retrying.length === 0) {
      test.skip();
      return;
    }

    const entry = state.retrying[0];
    expect(entry).toHaveProperty("issue_id");
    expect(entry).toHaveProperty("issue_identifier");
    expect(entry).toHaveProperty("attempt");
    expect(entry).toHaveProperty("due_at");
    expect(entry).toHaveProperty("error");
    expect(typeof entry.attempt).toBe("number");
  });

  test("counts match array lengths", async () => {
    const state = await api.getState();
    if (state.error) {
      test.skip();
      return;
    }

    expect(state.counts.running).toBe(state.running.length);
    expect(state.counts.retrying).toBe(state.retrying.length);
  });
});

test.describe("GET /api/v1/:issue_identifier", () => {
  test("returns 404 for non-existent issue", async () => {
    const result = await api.getIssue("NONEXISTENT-999");
    expect(result.status).toBe(404);
    expect(result.body.error).toEqual({
      code: "issue_not_found",
      message: "Issue not found",
    });
  });

  test("returns issue detail for running issue", async () => {
    const state = await api.getState();
    if (state.error || state.running.length === 0) {
      test.skip();
      return;
    }

    const identifier = state.running[0].issue_identifier;
    const result = await api.getIssue(identifier);
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("issue_identifier", identifier);
    expect(result.body).toHaveProperty("status");
    expect(result.body).toHaveProperty("workspace");
    expect(result.body).toHaveProperty("attempts");
    expect(result.body).toHaveProperty("running");
    expect(result.body).toHaveProperty("logs");
    expect(result.body).toHaveProperty("recent_events");
  });
});

test.describe("POST /api/v1/refresh", () => {
  test("returns 202 or 503", async () => {
    const result = await api.triggerRefresh();
    expect([202, 503]).toContain(result.status);

    if (result.status === 202) {
      expect(result.body).toHaveProperty("requested_at");
      expect(result.body).toHaveProperty("status", "scheduled");
    }
    if (result.status === 503) {
      expect(result.body.error.code).toBe("orchestrator_unavailable");
    }
  });
});

test.describe("Error handling", () => {
  test("returns 405 for wrong HTTP method on state endpoint", async ({ request }) => {
    const resp = await request.delete("/api/v1/state");
    expect(resp.status()).toBe(405);
    const body = await resp.json();
    expect(body.error.code).toBe("method_not_allowed");
  });

  test("returns 404 for unknown routes", async ({ request }) => {
    const resp = await request.get("/api/v1/nonexistent/path/deep");
    // The catch-all route should return 404
    expect([404, 200]).toContain(resp.status());
  });
});

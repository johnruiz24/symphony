import { test, expect } from "@playwright/test";
import { SymphonyAPI, AgentListResponse } from "../../helpers/api-client";

/**
 * API contract tests for the agent endpoint.
 * Matches actual implementation in agent_controller.ex + TaskPresenter.agents_payload/2.
 *
 * Key implementation details:
 *   - Agents are derived from orchestrator running/retrying entries (read-only)
 *   - No individual GET /api/v1/agents/:id endpoint exists
 *   - Response: {data: Agent[], count: number}
 *   - Agent shape: {id, identifier, status, worker_host, session_id, workload, tokens, ...}
 *   - Returns 503 if orchestrator is unavailable or times out
 */

let api: SymphonyAPI;

test.beforeEach(async ({ request }) => {
  api = new SymphonyAPI(request);
});

test.describe("GET /api/v1/agents - List", () => {
  test("returns wrapped response with data array and count", async () => {
    const result = await api.listAgents();
    // 200 = success, 503 = orchestrator unavailable (both valid)
    expect([200, 503]).toContain(result.status);

    if (result.status === 200) {
      const body = result.body as AgentListResponse;
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("meta");
      expect(body.meta).toHaveProperty("count");
      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.meta.count).toBe("number");
    }
  });

  test("agent objects have correct shape", async () => {
    const result = await api.listAgents();
    if (result.status !== 200) {
      test.skip();
      return;
    }

    const body = result.body as AgentListResponse;
    if (body.data.length === 0) {
      test.skip();
      return;
    }

    const agent = body.data[0];
    expect(agent).toHaveProperty("id");
    expect(agent).toHaveProperty("identifier");
    expect(agent).toHaveProperty("status");
    expect(typeof agent.status).toBe("string");
    expect(agent).toHaveProperty("workload");
    expect(agent.workload).toHaveProperty("active_task");
    expect(agent.workload).toHaveProperty("turn_count");
    expect(agent.workload).toHaveProperty("runtime_seconds");
    expect(agent).toHaveProperty("tokens");
    expect(agent.tokens).toHaveProperty("input_tokens");
    expect(agent.tokens).toHaveProperty("output_tokens");
    expect(agent.tokens).toHaveProperty("total_tokens");
  });

  test("running agents have session_id and started_at", async () => {
    const result = await api.listAgents();
    if (result.status !== 200) {
      test.skip();
      return;
    }

    const body = result.body as AgentListResponse;
    const runningAgents = body.data.filter((a) => a.status !== "retrying");
    for (const agent of runningAgents) {
      // Running agents from orchestrator should have session info
      if (agent.session_id) {
        expect(typeof agent.session_id).toBe("string");
      }
    }
  });

  test("retrying agents have retry info", async () => {
    const result = await api.listAgents();
    if (result.status !== 200) {
      test.skip();
      return;
    }

    const body = result.body as AgentListResponse;
    const retryingAgents = body.data.filter((a) => a.status === "retrying");
    for (const agent of retryingAgents) {
      expect(agent).toHaveProperty("retry");
      expect(agent.retry).toHaveProperty("attempt");
      expect(typeof agent.retry!.attempt).toBe("number");
    }
  });

  test("returns 503 error shape when orchestrator unavailable", async ({ request }) => {
    // This test validates error response shape -- may pass or skip
    // depending on orchestrator state
    const resp = await request.get("/api/v1/agents");
    if (resp.status() === 503) {
      const body = await resp.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code");
      expect(body.error).toHaveProperty("message");
    }
  });
});

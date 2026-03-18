import { test, expect } from "@playwright/test";
import { SymphonyAPI, TaskSingleResponse } from "../../helpers/api-client";
import { makeTask } from "../../helpers/test-data";

/**
 * API contract tests for the task CRUD endpoints.
 * Matches actual implementation in task_controller.ex + task_presenter.ex.
 *
 * Key implementation details:
 *   - Valid statuses: backlog, todo, in_progress, done
 *   - Valid priorities: low, medium, high, critical
 *   - Assignee field: assigned_agent (not assignee)
 *   - Responses wrapped: {data: Task} or {data: Task[], count: N}
 *   - Reassign: POST /api/v1/tasks/:id/reassign {agent_id: "..."}
 */

let api: SymphonyAPI;

test.beforeEach(async ({ request }) => {
  api = new SymphonyAPI(request);
});

test.describe("POST /api/v1/tasks - Create", () => {
  test("creates a task with required fields", async () => {
    const payload = makeTask();
    const result = await api.createTask(payload);

    expect(result.status).toBe(201);
    const body = result.body as TaskSingleResponse;
    expect(body.data).toHaveProperty("id");
    expect(body.data.title).toBe(payload.title);
    expect(body.data.status).toBe("backlog");
    expect(body.data.priority).toBe("medium");
    expect(body.data).toHaveProperty("created_at");
    expect(body.data).toHaveProperty("updated_at");
    expect(body.data).toHaveProperty("tags");
    expect(Array.isArray(body.data.tags)).toBe(true);
  });

  test("creates a task with all fields", async () => {
    const payload = makeTask({
      title: "Full-field task",
      description: "Detailed description",
      priority: "high",
      assigned_agent: "agent-alpha",
    });
    const result = await api.createTask(payload);

    expect(result.status).toBe(201);
    const body = result.body as TaskSingleResponse;
    expect(body.data.description).toBe("Detailed description");
    expect(body.data.priority).toBe("high");
    expect(body.data.assigned_agent).toBe("agent-alpha");
  });

  test("rejects task without title", async ({ request }) => {
    const resp = await request.post("/api/v1/tasks", {
      data: { description: "No title" },
    });
    expect(resp.status()).toBe(422);
    const body = await resp.json();
    expect(body.error.code).toBe("validation_error");
    expect(body.error.message).toContain("title");
  });

  test("rejects task with invalid status", async ({ request }) => {
    const resp = await request.post("/api/v1/tasks", {
      data: { title: "Bad status", status: "invalid_status" },
    });
    expect(resp.status()).toBe(422);
    const body = await resp.json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects task with invalid priority", async ({ request }) => {
    const resp = await request.post("/api/v1/tasks", {
      data: { title: "Bad priority", priority: "super_urgent" },
    });
    expect(resp.status()).toBe(422);
    const body = await resp.json();
    expect(body.error.code).toBe("validation_error");
  });

  test("assigns unique IDs to each task", async () => {
    const r1 = await api.createTask(makeTask());
    const r2 = await api.createTask(makeTask());
    const b1 = r1.body as TaskSingleResponse;
    const b2 = r2.body as TaskSingleResponse;
    expect(b1.data.id).not.toBe(b2.data.id);
  });
});

test.describe("GET /api/v1/tasks - List", () => {
  test("returns wrapped response with data array and count", async () => {
    const result = await api.listTasks();
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("data");
    expect(result.body).toHaveProperty("meta");
    expect(result.body.meta).toHaveProperty("count");
    expect(Array.isArray(result.body.data)).toBe(true);
    expect(typeof result.body.meta.count).toBe("number");
  });

  test("filters by status", async () => {
    // Create a task (default status is backlog)
    await api.createTask(makeTask());

    const result = await api.listTasks({ status: "backlog" });
    expect(result.status).toBe(200);
    for (const task of result.body.data) {
      expect(task.status).toBe("backlog");
    }
  });

  test("filters by priority", async () => {
    await api.createTask(makeTask({ priority: "high" }));
    const result = await api.listTasks({ priority: "high" });
    expect(result.status).toBe(200);
    for (const task of result.body.data) {
      expect(task.priority).toBe("high");
    }
  });

  test("filters by assignee", async () => {
    await api.createTask(makeTask({ assigned_agent: "agent-filter-test" }));
    const result = await api.listTasks({ assignee: "agent-filter-test" });
    expect(result.status).toBe(200);
    for (const task of result.body.data) {
      expect(task.assigned_agent).toBe("agent-filter-test");
    }
  });
});

test.describe("GET /api/v1/tasks/:id - Get", () => {
  test("returns task by ID wrapped in data", async () => {
    const created = await api.createTask(makeTask());
    const createdData = (created.body as TaskSingleResponse).data;
    const result = await api.getTask(createdData.id);

    expect(result.status).toBe(200);
    const body = result.body as TaskSingleResponse;
    expect(body.data.id).toBe(createdData.id);
    expect(body.data.title).toBe(createdData.title);
  });

  test("returns 404 for non-existent task", async () => {
    const result = await api.getTask("nonexistent-id-12345");
    expect(result.status).toBe(404);
  });
});

test.describe("PATCH /api/v1/tasks/:id - Update", () => {
  test("updates task status", async () => {
    const created = await api.createTask(makeTask());
    const id = (created.body as TaskSingleResponse).data.id;
    const result = await api.updateTask(id, { status: "in_progress" });

    expect(result.status).toBe(200);
    const body = result.body as TaskSingleResponse;
    expect(body.data.status).toBe("in_progress");
  });

  test("updates assigned_agent", async () => {
    const created = await api.createTask(makeTask());
    const id = (created.body as TaskSingleResponse).data.id;
    const result = await api.updateTask(id, { assigned_agent: "agent-beta" });

    expect(result.status).toBe(200);
    const body = result.body as TaskSingleResponse;
    expect(body.data.assigned_agent).toBe("agent-beta");
  });

  test("updates priority", async () => {
    const created = await api.createTask(makeTask({ priority: "low" }));
    const id = (created.body as TaskSingleResponse).data.id;
    const result = await api.updateTask(id, { priority: "high" });

    expect(result.status).toBe(200);
    const body = result.body as TaskSingleResponse;
    expect(body.data.priority).toBe("high");
  });

  test("updates updated_at timestamp", async () => {
    const created = await api.createTask(makeTask());
    const createdData = (created.body as TaskSingleResponse).data;
    await new Promise((r) => setTimeout(r, 1100));
    const updated = await api.updateTask(createdData.id, { title: "Updated title" });

    const updatedData = (updated.body as TaskSingleResponse).data;
    expect(updatedData.updated_at).not.toBe(createdData.created_at);
  });

  test("rejects invalid status value", async () => {
    const created = await api.createTask(makeTask());
    const id = (created.body as TaskSingleResponse).data.id;
    const result = await api.updateTask(id, { status: "completed" as any });

    expect(result.status).toBe(422);
  });

  test("returns 404 for non-existent task", async () => {
    const result = await api.updateTask("nonexistent-id-12345", { status: "done" });
    expect(result.status).toBe(404);
  });
});

test.describe("POST /api/v1/tasks/:id/reassign - Reassign", () => {
  test("reassigns task to a different agent", async () => {
    const created = await api.createTask(makeTask({ assigned_agent: "agent-alpha" }));
    const id = (created.body as TaskSingleResponse).data.id;
    const result = await api.reassignTask(id, "agent-beta");

    expect(result.status).toBe(200);
    const body = result.body as TaskSingleResponse;
    expect(body.data.assigned_agent).toBe("agent-beta");
    expect(body.data.status).toBe("todo");
  });

  test("rejects reassign without agent_id", async ({ request }) => {
    const created = await api.createTask(makeTask());
    const id = (created.body as TaskSingleResponse).data.id;
    const resp = await request.post(`/api/v1/tasks/${id}/reassign`, {
      data: {},
    });
    expect(resp.status()).toBe(422);
  });

  test("returns 404 for non-existent task", async () => {
    const result = await api.reassignTask("nonexistent-id", "agent-beta");
    expect(result.status).toBe(404);
  });
});

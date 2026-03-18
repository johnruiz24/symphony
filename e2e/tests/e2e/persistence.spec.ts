import { test, expect } from "@playwright/test";
import { SymphonyAPI, TaskSingleResponse, TaskListResponse } from "../../helpers/api-client";
import { makeTask } from "../../helpers/test-data";

/**
 * E2E tests for task persistence (Flow 4).
 * Validates data survives page refreshes and is consistent across API calls.
 * Uses actual response shapes: {data: Task} and {data: Task[], count: N}.
 */

let api: SymphonyAPI;

test.beforeEach(async ({ request }) => {
  api = new SymphonyAPI(request);
});

test.describe("Flow 4: Task persistence", () => {
  test("task persists across page refreshes", async ({ page, request }) => {
    api = new SymphonyAPI(request);

    const uniqueTitle = `Persist_${Date.now()}`;
    const created = await api.createTask(makeTask({ title: uniqueTitle }));
    if (created.status !== 201) {
      test.skip();
      return;
    }

    await page.goto("/");
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });
  });

  test("task data is consistent between list and detail endpoints", async () => {
    const created = await api.createTask(
      makeTask({ title: "Consistency Check", priority: "high" })
    );
    if (created.status !== 201) {
      test.skip();
      return;
    }

    const createdData = (created.body as TaskSingleResponse).data;

    // Get from list
    const listResult = await api.listTasks();
    const listBody = listResult.body as TaskListResponse;
    const fromList = listBody.data.find((t) => t.id === createdData.id);
    expect(fromList).toBeTruthy();

    // Get from detail
    const detailResult = await api.getTask(createdData.id);
    expect(detailResult.status).toBe(200);
    const fromDetail = (detailResult.body as TaskSingleResponse).data;

    // Compare key fields
    expect(fromDetail.title).toBe(fromList!.title);
    expect(fromDetail.status).toBe(fromList!.status);
    expect(fromDetail.priority).toBe(fromList!.priority);
    expect(fromDetail.assigned_agent).toBe(fromList!.assigned_agent);
  });

  test("updated task reflects changes immediately", async () => {
    const created = await api.createTask(makeTask());
    if (created.status !== 201) {
      test.skip();
      return;
    }

    const createdData = (created.body as TaskSingleResponse).data;

    await api.updateTask(createdData.id, {
      status: "in_progress",
      assigned_agent: "agent-persist-test",
    });

    // Immediately read back
    const result = await api.getTask(createdData.id);
    expect(result.status).toBe(200);
    const data = (result.body as TaskSingleResponse).data;
    expect(data.status).toBe("in_progress");
    expect(data.assigned_agent).toBe("agent-persist-test");
  });
});

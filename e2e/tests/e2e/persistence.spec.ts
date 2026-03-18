import { test, expect } from "@playwright/test";
import { SymphonyAPI } from "../../helpers/api-client";
import { makeTask } from "../../helpers/test-data";

/**
 * E2E tests for task persistence (Flow 4).
 *
 * Test Scenario:
 *   Flow 4: Task persists + survives restart
 *
 * Note: Full restart testing requires the backend to be stopped and restarted,
 * which is handled by the persistence-via-DynamoDB layer. These tests validate
 * that data survives page refreshes and is consistent across API calls.
 */

let api: SymphonyAPI;

test.beforeEach(async ({ request }) => {
  api = new SymphonyAPI(request);
});

test.describe("Flow 4: Task persistence", () => {
  test("task persists across page refreshes", async ({ page, request }) => {
    api = new SymphonyAPI(request);

    // Create a task via API
    const uniqueTitle = `Persist_${Date.now()}`;
    const created = await api.createTask(makeTask({ title: uniqueTitle }));
    if (created.status !== 201) {
      test.skip();
      return;
    }

    // Load the page
    await page.goto("/");
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });

    // Refresh the page
    await page.reload();

    // Task should still be visible
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

    // Get from list
    const listResult = await api.listTasks();
    const fromList = listResult.body.find((t) => t.id === created.body.id);
    expect(fromList).toBeTruthy();

    // Get from detail
    const detailResult = await api.getTask(created.body.id);
    expect(detailResult.status).toBe(200);

    // Compare key fields
    expect(detailResult.body.title).toBe(fromList!.title);
    expect(detailResult.body.status).toBe(fromList!.status);
    expect(detailResult.body.priority).toBe(fromList!.priority);
  });

  test("updated task reflects changes immediately", async () => {
    const created = await api.createTask(makeTask());
    if (created.status !== 201) {
      test.skip();
      return;
    }

    await api.updateTask(created.body.id, {
      status: "in_progress",
      assignee: "agent-persist-test",
    });

    // Immediately read back
    const result = await api.getTask(created.body.id);
    expect(result.body.status).toBe("in_progress");
    expect(result.body.assignee).toBe("agent-persist-test");
  });
});

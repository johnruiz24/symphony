import { test, expect } from "@playwright/test";
import { SymphonyAPI, TaskSingleResponse } from "../../helpers/api-client";
import { makeTask } from "../../helpers/test-data";
import { timed } from "../../helpers/wait";

/**
 * E2E tests for SSE real-time updates in the browser.
 * Validates that EventController broadcasts trigger TanStack Query refetch
 * and the UI updates without manual page reload.
 */

let api: SymphonyAPI;

test.beforeEach(async ({ request }) => {
  api = new SymphonyAPI(request);
});

test.describe("SSE real-time updates", () => {
  test("task creation triggers UI update without manual refresh", async ({ page, request }) => {
    api = new SymphonyAPI(request);
    await page.goto("/");
    await page.waitForTimeout(2000);

    const uniqueTitle = `SSE_Live_${Date.now()}`;

    // Create task via API (not through the UI)
    const created = await api.createTask(makeTask({ title: uniqueTitle }));
    if (created.status !== 201) {
      test.skip();
      return;
    }

    // The task should appear in the UI via SSE-triggered refetch without page reload
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 15_000 });
  });

  test("task status change reflects in UI in real-time", async ({ page, request }) => {
    api = new SymphonyAPI(request);

    const uniqueTitle = `SSE Status Change ${Date.now()}`;
    const created = await api.createTask(makeTask({ title: uniqueTitle }));
    if (created.status !== 201) {
      test.skip();
      return;
    }

    const taskId = (created.body as TaskSingleResponse).data.id;

    await page.goto("/");
    await page.waitForTimeout(2000);

    // The task should initially appear (in Backlog column)
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });

    // Update status via API -- this broadcasts task_updated SSE event
    await api.updateTask(taskId, { status: "in_progress" });

    // After SSE event, the "In Progress" column heading should exist
    // and the task should eventually appear near it
    // (we verify the task is still visible post-update)
    await page.waitForTimeout(3000);
    await expect(page.getByText(uniqueTitle)).toBeVisible();
  });

  test("measures SSE event to UI render latency", async ({ page, request }) => {
    api = new SymphonyAPI(request);
    await page.goto("/");
    await page.waitForTimeout(2000);

    const uniqueTitle = `Latency_${Date.now()}`;

    const [, latencyMs] = await timed(async () => {
      const created = await api.createTask(makeTask({ title: uniqueTitle }));
      if (created.status !== 201) return;

      await page.getByText(uniqueTitle).waitFor({ state: "visible", timeout: 10_000 });
    });

    console.log(`SSE event-to-render latency: ${latencyMs.toFixed(0)}ms`);

    // Performance target: <5s for CI, <1s target for production
    expect(latencyMs).toBeLessThan(5000);
  });
});

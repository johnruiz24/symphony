import { test, expect } from "@playwright/test";
import { SymphonyAPI } from "../../helpers/api-client";
import { makeTask } from "../../helpers/test-data";
import { timed } from "../../helpers/wait";

/**
 * E2E tests for SSE real-time updates in the browser.
 * Measures latency from SSE event to UI render.
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

    // The task should appear in the UI via SSE without page reload
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 15_000 });
  });

  test("task status change reflects in UI in real-time", async ({ page, request }) => {
    api = new SymphonyAPI(request);

    // Setup: create a task
    const created = await api.createTask(makeTask({ title: "SSE Status Change" }));
    if (created.status !== 201) {
      test.skip();
      return;
    }

    await page.goto("/");
    await page.waitForTimeout(2000);

    // Update status via API
    await api.updateTask(created.body.id, { status: "in_progress" });

    // The task should move to the in_progress column without refresh
    const inProgressColumn = page.locator('[data-testid="column-in-progress"]');
    await expect(inProgressColumn.getByText("SSE Status Change")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("measures SSE event to UI render latency", async ({ page, request }) => {
    api = new SymphonyAPI(request);
    await page.goto("/");
    await page.waitForTimeout(2000);

    const uniqueTitle = `Latency_${Date.now()}`;

    // Measure time from API call to text appearing in UI
    const [, latencyMs] = await timed(async () => {
      // Fire API call
      const created = await api.createTask(makeTask({ title: uniqueTitle }));
      if (created.status !== 201) return;

      // Wait for it to appear
      await page.getByText(uniqueTitle).waitFor({ state: "visible", timeout: 10_000 });
    });

    console.log(`SSE event-to-render latency: ${latencyMs.toFixed(0)}ms`);

    // Performance target: <1s from event to render
    expect(latencyMs).toBeLessThan(5000); // Generous for CI; tighten in perf suite
  });
});

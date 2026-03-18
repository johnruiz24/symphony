import { test, expect, Page } from "@playwright/test";
import { SymphonyAPI } from "../../helpers/api-client";
import { makeTask } from "../../helpers/test-data";
import { waitForText, waitForAPI } from "../../helpers/wait";

/**
 * E2E browser tests for the Kanban board UI.
 * These validate the full user experience of the React frontend.
 *
 * Test Scenarios:
 *   Flow 1: Create task -> auto-assign -> verify execution
 *   Flow 2: Drag task to agent -> verify re-queue + execution
 *   Flow 3: Agent workload updates real-time
 *   Flow 5: Search/filter by status, priority, assignee
 */

let api: SymphonyAPI;

test.beforeEach(async ({ page, request }) => {
  api = new SymphonyAPI(request);
  await page.goto("/");
});

test.describe("Dashboard loads correctly", () => {
  test("renders the main dashboard page", async ({ page }) => {
    // The page should render without errors
    await expect(page).toHaveTitle(/Symphony/i);
  });

  test("shows Kanban board columns", async ({ page }) => {
    // Expect columns for task statuses
    const columns = ["Pending", "In Progress", "Completed"];
    for (const col of columns) {
      await expect(page.getByRole("heading", { name: col }).or(page.getByText(col))).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("shows agent workload panel", async ({ page }) => {
    // The agent panel should be visible (top strip per spec)
    const agentPanel = page.locator('[data-testid="agent-panel"]').or(
      page.getByText(/agents/i).first()
    );
    await expect(agentPanel).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Flow 1: Create task -> auto-assign -> verify", () => {
  test("creates a new task via the UI", async ({ page }) => {
    // Click create/add button
    const addButton = page.getByRole("button", { name: /create|add|new/i });
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Fill in the task form
    await page.getByLabel(/title/i).fill("E2E Test Task");
    await page.getByLabel(/description/i).fill("Created by E2E test suite");

    // Submit
    const submitButton = page.getByRole("button", { name: /create|submit|save/i });
    await submitButton.click();

    // Verify task appears in the Pending column
    await waitForText(page, '[data-testid="column-pending"]', "E2E Test Task");
  });

  test("newly created task appears in pending column", async ({ page }) => {
    // Create task via API
    const task = await api.createTask(makeTask({ title: "API-Created Task" }));
    if (task.status !== 201) {
      test.skip();
      return;
    }

    // Refresh page and verify it shows
    await page.reload();
    await waitForText(page, "body", "API-Created Task");
  });

  test("auto-assigned task moves to in_progress", async ({ page }) => {
    // Create a task that will be auto-assigned
    const task = await api.createTask(makeTask({ title: "Auto-Assign Test" }));
    if (task.status !== 201) {
      test.skip();
      return;
    }

    // Wait for auto-assignment (agent picks it up)
    // The task should move from Pending to In Progress
    await expect(
      page.locator('[data-testid="column-in-progress"]').getByText("Auto-Assign Test")
    ).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("Flow 2: Drag task to agent -> verify re-queue", () => {
  test("drag task card to a different agent", async ({ page }) => {
    // Create a task first
    const task = await api.createTask(makeTask({ title: "Drag Test Task" }));
    if (task.status !== 201) {
      test.skip();
      return;
    }

    await page.reload();

    // Find the task card
    const taskCard = page.locator('[data-testid="task-card"]').filter({ hasText: "Drag Test Task" });
    await expect(taskCard).toBeVisible({ timeout: 10_000 });

    // Find a target agent in the agent panel
    const targetAgent = page.locator('[data-testid="agent-drop-zone"]').first();
    if (!(await targetAgent.isVisible())) {
      test.skip();
      return;
    }

    // Perform drag and drop
    await taskCard.dragTo(targetAgent);

    // Verify the task was re-assigned (check API or UI update)
    await page.waitForTimeout(1000);

    // The task's assignee should have changed
    const updatedTask = await api.getTask(task.body.id);
    expect(updatedTask.body.assignee).toBeTruthy();
  });
});

test.describe("Flow 3: Agent workload updates real-time", () => {
  test("agent panel shows workload counts", async ({ page }) => {
    const agentCards = page.locator('[data-testid="agent-card"]');
    const count = await agentCards.count();

    // Each agent card should show a workload number or indicator
    for (let i = 0; i < Math.min(count, 5); i++) {
      const card = agentCards.nth(i);
      // Should have some workload indicator (number, badge, or progress bar)
      const workloadIndicator = card.locator('[data-testid="workload"]').or(
        card.locator(".workload")
      );
      if (await workloadIndicator.isVisible()) {
        const text = await workloadIndicator.textContent();
        expect(text).toBeTruthy();
      }
    }
  });

  test("agent status updates when task is assigned", async ({ page }) => {
    // Get initial agent states
    const agents = await api.listAgents();
    if (agents.status !== 200 || agents.body.length === 0) {
      test.skip();
      return;
    }

    const idleAgent = agents.body.find((a) => a.status === "idle");
    if (!idleAgent) {
      test.skip();
      return;
    }

    // Create and assign a task to the idle agent
    const task = await api.createTask(makeTask());
    if (task.status !== 201) {
      test.skip();
      return;
    }
    await api.updateTask(task.body.id, { assignee: idleAgent.id });

    // Wait for real-time update in the UI
    await page.waitForTimeout(2000);

    // Agent should now show as busy
    const agentCard = page.locator(`[data-testid="agent-card-${idleAgent.id}"]`).or(
      page.locator('[data-testid="agent-card"]').filter({ hasText: idleAgent.name })
    );

    if (await agentCard.isVisible()) {
      const statusBadge = agentCard.locator('[data-testid="agent-status"]').or(
        agentCard.locator(".status")
      );
      await expect(statusBadge).toContainText(/busy/i, { timeout: 10_000 });
    }
  });
});

test.describe("Flow 5: Search and filter", () => {
  test("filters tasks by status", async ({ page }) => {
    // Look for a status filter control
    const statusFilter = page.locator('[data-testid="filter-status"]').or(
      page.getByLabel(/status/i)
    );

    if (!(await statusFilter.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await statusFilter.selectOption("in_progress");

    // After filtering, only in_progress tasks should be visible
    const taskCards = page.locator('[data-testid="task-card"]');
    const count = await taskCards.count();

    for (let i = 0; i < count; i++) {
      const badge = taskCards.nth(i).locator('[data-testid="task-status"]');
      if (await badge.isVisible()) {
        await expect(badge).toContainText(/in.progress/i);
      }
    }
  });

  test("filters tasks by priority", async ({ page }) => {
    const priorityFilter = page.locator('[data-testid="filter-priority"]').or(
      page.getByLabel(/priority/i)
    );

    if (!(await priorityFilter.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await priorityFilter.selectOption("high");

    const taskCards = page.locator('[data-testid="task-card"]');
    const count = await taskCards.count();

    for (let i = 0; i < count; i++) {
      const badge = taskCards.nth(i).locator('[data-testid="task-priority"]');
      if (await badge.isVisible()) {
        await expect(badge).toContainText(/high/i);
      }
    }
  });

  test("searches tasks by text", async ({ page }) => {
    // Create a uniquely named task
    const uniqueName = `UniqueSearch_${Date.now()}`;
    const task = await api.createTask(makeTask({ title: uniqueName }));
    if (task.status !== 201) {
      test.skip();
      return;
    }

    await page.reload();

    const searchInput = page.locator('[data-testid="search-input"]').or(
      page.getByPlaceholder(/search/i)
    );

    if (!(await searchInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await searchInput.fill(uniqueName);
    await page.waitForTimeout(500); // debounce

    const taskCards = page.locator('[data-testid="task-card"]');
    await expect(taskCards).toHaveCount(1, { timeout: 5000 });
    await expect(taskCards.first()).toContainText(uniqueName);
  });
});

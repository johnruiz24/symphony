import type { CreateTaskPayload } from "./api-client";

/**
 * Reusable test data factories for Symphony E2E tests.
 * Field names and values match the actual backend:
 *   - Statuses: backlog, todo, in_progress, done (from task_controller.ex @valid_statuses)
 *   - Priorities: low, medium, high, urgent (from task_controller.ex @valid_priorities)
 *   - Assignee field: assigned_agent (from task_store.ex type)
 */

let counter = 0;

function nextId(): number {
  return ++counter;
}

export function resetCounter(): void {
  counter = 0;
}

export function makeTask(overrides?: Partial<CreateTaskPayload>): CreateTaskPayload {
  const id = nextId();
  return {
    title: `Test Task ${id}`,
    description: `Automated test task #${id} created by E2E suite`,
    priority: "medium",
    ...overrides,
  };
}

export function makeBulkTasks(count: number, overrides?: Partial<CreateTaskPayload>): CreateTaskPayload[] {
  return Array.from({ length: count }, (_, i) =>
    makeTask({
      title: `Bulk Task ${i + 1}`,
      ...overrides,
    })
  );
}

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const STATUSES = ["backlog", "todo", "in_progress", "done"] as const;

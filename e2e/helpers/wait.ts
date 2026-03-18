import { Page, expect } from "@playwright/test";

/**
 * Wait utilities for E2E tests.
 */

/** Wait for an element matching the selector to appear and contain text. */
export async function waitForText(page: Page, selector: string, text: string, timeoutMs = 5000) {
  await expect(page.locator(selector).filter({ hasText: text })).toBeVisible({
    timeout: timeoutMs,
  });
}

/** Wait for a network request to a specific API path to complete. */
export async function waitForAPI(page: Page, pathPattern: string | RegExp) {
  return page.waitForResponse(
    (resp) => {
      const url = resp.url();
      if (typeof pathPattern === "string") return url.includes(pathPattern);
      return pathPattern.test(url);
    },
    { timeout: 10_000 }
  );
}

/** Wait for an SSE event to arrive by polling the UI for a state change. */
export async function waitForSSEUpdate(page: Page, checkFn: () => Promise<boolean>, intervalMs = 500, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkFn()) return;
    await page.waitForTimeout(intervalMs);
  }
  throw new Error(`SSE update not detected within ${timeoutMs}ms`);
}

/** Measure time for an async operation. Returns [result, elapsedMs]. */
export async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;
  return [result, elapsed];
}

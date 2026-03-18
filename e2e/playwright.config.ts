import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";
const API_URL = process.env.API_URL ?? BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // API contract tests -- no browser needed
    {
      name: "api",
      testDir: "./tests/api",
      use: {
        baseURL: API_URL,
      },
    },

    // E2E browser tests -- Chromium
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: BASE_URL,
      },
    },

    // E2E browser tests -- Firefox (cross-browser)
    {
      name: "e2e-firefox",
      testDir: "./tests/e2e",
      use: {
        ...devices["Desktop Firefox"],
        baseURL: BASE_URL,
      },
    },
  ],

  // Start backend + frontend before running tests
  webServer: [
    {
      command: "cd ../elixir && ./bin/symphony --port 4000 ./WORKFLOW.md",
      url: `${BASE_URL}/api/v1/state`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});

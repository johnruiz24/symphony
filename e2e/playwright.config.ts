import { defineConfig, devices } from "@playwright/test";

// Frontend dev server (Vite on port 3000, proxies /api to backend)
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
// Backend API directly (Elixir on port 4000)
const API_URL = process.env.API_URL ?? "http://localhost:4000";

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
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // API contract tests -- no browser needed, hit backend directly
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
        baseURL: FRONTEND_URL,
      },
    },

    // E2E browser tests -- Firefox (cross-browser)
    {
      name: "e2e-firefox",
      testDir: "./tests/e2e",
      use: {
        ...devices["Desktop Firefox"],
        baseURL: FRONTEND_URL,
      },
    },
  ],

  // Start backend + frontend before running tests
  webServer: [
    {
      command: "cd ../elixir && ./bin/symphony --port 4000 ./WORKFLOW.md",
      url: `${API_URL}/api/v1/state`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "cd ../frontend && npm run dev",
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});

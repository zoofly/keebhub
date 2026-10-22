import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// Runs against a build served by `vite preview`, i.e. the real Worker in
// workerd with a local D1 (migrations applied first).
//
// Until the backend track (B1-B4) is merged, the build uses `--mode e2e`:
// the SPA answers /api/* (except /api/health) from the MSW mocks in
// src/client/mocks, and Turnstile uses Cloudflare's always-pass test site key.
// At cutover, drop `--mode e2e` so the suite runs against the real API.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      // Phone width. API-only specs don't depend on the viewport, so they run once.
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, hasTouch: true },
      testIgnore: ["**/smoke.spec.ts"],
    },
  ],
  webServer: {
    command: `npx vite build --mode e2e && npm run db:migrate:local && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

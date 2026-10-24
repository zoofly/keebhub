import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// Runs against the production build served by `vite preview`: the real
// Worker in workerd with a fresh local D1 for each run (e2e/server.ts),
// seeded through the API by e2e/global-setup.ts. No MSW.
//
// Tests share that database, so they run one at a time (workers: 1).
// Register and login reach Turnstile siteverify (with Cloudflare's test keys)
// and the HIBP API from the Worker, so the suite needs network access.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
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
      // Phone width. API-only and build checks don't depend on the viewport, so they run once.
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, hasTouch: true },
      testIgnore: ["**/smoke.spec.ts", "**/build-hygiene.spec.ts", "**/security-headers.spec.ts"],
    },
  ],
  webServer: {
    command: "node e2e/server.ts",
    env: { E2E_PORT: String(PORT) },
    url: `http://localhost:${PORT}/api/health`,
    // Always a fresh server: each run gets its own empty database.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});

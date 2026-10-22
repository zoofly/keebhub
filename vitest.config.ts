import { randomBytes } from "node:crypto";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

  return {
    test: {
      projects: [
        {
          // Worker and shared code, run inside workerd with a local D1 per
          // test file (migrations applied in src/worker/test/setup.ts).
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  // Random per run: nothing depends on the values, and
                  // outbound fetches (Turnstile, HIBP) are mocked in tests.
                  PASSWORD_PEPPER_V1: randomBytes(32).toString("base64"),
                  TURNSTILE_SECRET_KEY: randomBytes(16).toString("hex"),
                },
              },
            }),
          ],
          test: {
            name: "worker",
            include: ["src/worker/**/*.test.ts", "src/shared/**/*.test.ts"],
            setupFiles: ["./src/worker/test/setup.ts"],
          },
        },
        {
          // React components in jsdom.
          plugins: [react()],
          test: {
            name: "client",
            environment: "jsdom",
            include: ["src/client/**/*.test.{ts,tsx}"],
          },
        },
      ],
    },
  };
});

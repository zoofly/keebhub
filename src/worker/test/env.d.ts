import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      /** Migrations read by vitest.config.ts, applied in setup.ts. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

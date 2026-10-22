// Public, cacheable reads: the switch catalog and client config.
import { Hono } from "hono";
import type { Health } from "../../shared/schemas";
import { listSwitches } from "../db/switches";
import type { AppEnv } from "../env";
import { jsonError } from "../middleware/errors";

export const publicRoutes = new Hono<AppEnv>()
  .get("/health", async (c) => {
    c.header("Cache-Control", "no-store");
    try {
      await c.env.DB.prepare("SELECT 1").first();
    } catch (err) {
      console.error(
        JSON.stringify({
          message: "health check failed",
          cfRay: c.req.header("cf-ray") ?? null,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return jsonError(c, 503, "unavailable", "Database unavailable");
    }
    return c.json({ status: "ok" } satisfies Health, 200);
  })

  .get("/switches", async (c) => {
    const items = await listSwitches(c.env.DB);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ items }, 200);
  })

  // Public settings the SPA needs at runtime (the Turnstile site key).
  .get("/config", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY }, 200);
  });

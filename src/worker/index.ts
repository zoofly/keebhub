import { Hono } from "hono";
import type { Health } from "../shared/schemas";
import type { AppEnv } from "./env";
import { jsonError, notFound, onError } from "./middleware/errors";

const app = new Hono<AppEnv>().basePath("/api");

app.notFound(notFound);
app.onError(onError);

// Routes are chained so `AppType` carries their types to the client (hc).
const routes = app.get("/health", async (c) => {
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
});

export type AppType = typeof routes;

export default {
  fetch: app.fetch,

  // Daily cron (wrangler.jsonc `triggers`). Phase B2 adds the purge of
  // expired sessions and auth_throttle rows here.
  async scheduled(controller) {
    console.log(JSON.stringify({ message: "scheduled run", cron: controller.cron }));
  },
} satisfies ExportedHandler<Env>;

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { BODY_LIMIT_BYTES, LISTINGS_RATE_WINDOW_SECONDS } from "../shared/limits";
import { purgeExpiredSessions } from "./auth/session";
import { purgePostingCreatesStatement } from "./db/postings";
import { purgeThrottleStatement } from "./db/throttle";
import type { AppEnv } from "./env";
import { nowSeconds } from "./lib/time";
import { jsonError, notFound, onError } from "./middleware/errors";
import { jsonOnly, noStoreByDefault, originCheck } from "./middleware/security";
import { loadSession } from "./middleware/session";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { postingRoutes } from "./routes/postings";
import { publicRoutes } from "./routes/public";

const app = new Hono<AppEnv>().basePath("/api");

app.notFound(notFound);
app.onError(onError);

app.use(
  secureHeaders({
    // API responses are JSON; nothing in them should ever render or frame.
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  }),
);
app.use(noStoreByDefault);
app.use(
  bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => jsonError(c, 413, "payload_too_large", "Request body is too large"),
  }),
);
app.use(jsonOnly);
app.use(originCheck);
app.use(loadSession);

// Routes are chained so `AppType` carries their types to the client (hc).
const routes = app
  .route("/", publicRoutes)
  .route("/auth", authRoutes)
  .route("/postings", postingRoutes)
  .route("/me", meRoutes);

export type AppType = typeof routes;

/** Daily cron: drop expired sessions, finished throttle windows and old create-log rows. */
export async function purgeExpired(db: D1Database): Promise<void> {
  await db.batch([
    purgeExpiredSessions(db),
    purgeThrottleStatement(db),
    purgePostingCreatesStatement(db, nowSeconds() - LISTINGS_RATE_WINDOW_SECONDS),
  ]);
}

export default {
  fetch: app.fetch,

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      purgeExpired(env.DB).then(
        () => console.log(JSON.stringify({ message: "purge complete", cron: controller.cron })),
        (err: unknown) =>
          console.error(
            JSON.stringify({
              message: "purge failed",
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
      ),
    );
  },
} satisfies ExportedHandler<Env>;

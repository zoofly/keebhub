import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { jsonError } from "./errors";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF layer 2: unsafe requests must send JSON (415 otherwise). A request
 * with no body and no Content-Type (e.g. PUT /api/me/saved/1) is allowed;
 * HTML forms always send a form Content-Type, so they are refused.
 */
export const jsonOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (UNSAFE_METHODS.has(c.req.method)) {
    const contentType = c.req.header("content-type");
    const hasBody =
      c.req.header("transfer-encoding") !== undefined ||
      Number(c.req.header("content-length") ?? "0") > 0;
    const isJson =
      contentType !== undefined && /^application\/json\s*(;|$)/i.test(contentType.trim());
    if ((contentType !== undefined || hasBody) && !isJson) {
      return jsonError(
        c,
        415,
        "unsupported_media_type",
        "Send the request body as application/json",
      );
    }
  }
  await next();
};

/**
 * CSRF layer 3: unsafe requests must come from this origin, shown by
 * Sec-Fetch-Site: same-origin or an Origin header equal to our own. Anything
 * else (including neither header) gets 403. There is deliberately no CORS.
 */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (UNSAFE_METHODS.has(c.req.method)) {
    const fetchSite = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    const sameOrigin =
      fetchSite === "same-origin" || (origin !== undefined && origin === new URL(c.req.url).origin);
    if (!sameOrigin) {
      return jsonError(c, 403, "forbidden", "Cross-origin request refused");
    }
  }
  await next();
};

/**
 * Responses that didn't choose a cache policy are never cached. Neither is
 * any response that sets a cookie (a session refresh or clear), even on a
 * public, cacheable route: a shared cache must never store or replay a
 * Set-Cookie with someone's session token.
 */
export const noStoreByDefault: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control") || c.res.headers.has("Set-Cookie")) {
    c.res.headers.set("Cache-Control", "no-store");
  }
};

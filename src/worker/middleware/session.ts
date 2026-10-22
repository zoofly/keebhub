import type { MiddlewareHandler } from "hono";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
  validateSessionToken,
} from "../auth/session";
import type { AppEnv, AuthedEnv } from "../env";
import { jsonError } from "./errors";

/**
 * Reads the session cookie on every API request and sets c.var.user and
 * c.var.session (null when signed out). Refreshes the cookie when the
 * sliding expiry moved, and clears a cookie that no longer maps to a valid
 * session.
 */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  c.set("session", null);
  const token = readSessionCookie(c);
  if (token) {
    const result = await validateSessionToken(c.env.DB, token);
    if (result) {
      c.set("user", result.user);
      c.set("session", result.session);
      if (result.refreshed) {
        setSessionCookie(c, token, result.session.expiresAt);
      }
    } else {
      clearSessionCookie(c);
    }
  }
  await next();
};

/** Default-deny: 401 unless signed in. */
export const requireUser: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  // The vars are typed as non-null for the handlers that follow; check here.
  if (!c.get("user") || !c.get("session")) {
    return jsonError(c, 401, "unauthorized", "Sign in required");
  }
  await next();
};

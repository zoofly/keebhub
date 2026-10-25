import type { Context, Env as HonoEnv, MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { ipKeyPart } from "../lib/ip";
import { jsonError } from "./errors";

/** The client IP as Cloudflare reports it (absent in some local setups). */
export const clientIp = <E extends HonoEnv>(c: Context<E>): string | null =>
  c.req.header("cf-connecting-ip") ?? null;

/** 429 + Retry-After in the shared error shape. */
export function rateLimited<E extends HonoEnv>(c: Context<E>, retryAfterSeconds: number) {
  c.header("Retry-After", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  return jsonError(c, 429, "rate_limited", "Too many attempts. Try again later.");
}

/**
 * Coarse per-IP guard from the Workers Rate Limiting binding (10 per 60 s
 * per Cloudflare location). Feature-detected: skipped if the binding is
 * absent. The D1 throttle is the authoritative limit.
 */
export const authRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const limiter = c.env.AUTH_LIMITER as RateLimit | undefined;
  if (limiter) {
    const { success } = await limiter.limit({ key: ipKeyPart(clientIp(c)) });
    if (!success) {
      return rateLimited(c, 60);
    }
  }
  await next();
};

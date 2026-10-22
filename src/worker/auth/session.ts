// Server-side sessions stored in D1, following Lucia's auth_session pattern.
//
// - Token "<id>.<secret>", each 120 random bits in lower-case base32.
// - D1 stores the id and SHA-256(secret); the raw token is never stored.
// - 7 days sliding, refreshed only once less than half the window is left
//   (so most requests cost one read and no write), capped at 30 days from
//   creation.
// - Cookie: __Host-keebhub_session; Secure, HttpOnly, SameSite=Lax, Path=/.

import type { Context, Env as HonoEnv } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { User } from "../../shared/schemas";
import {
  deleteSession,
  findSession,
  insertSession,
  purgeSessionsStatement,
  updateSessionExpiry,
} from "../db/sessions";
import { bytesEqual, randomId120, sha256 } from "../lib/crypto";
import { nowSeconds } from "../lib/time";

export const SESSION_COOKIE = "__Host-keebhub_session";
export const SESSION_IDLE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_THRESHOLD_SECONDS = SESSION_IDLE_SECONDS / 2;

const TOKEN_PATTERN = /^([a-z2-7]{24})\.([a-z2-7]{24})$/;

export interface Session {
  id: string;
  userId: number;
  createdAt: number;
  expiresAt: number;
}

export interface CreatedSession extends Session {
  token: string;
}

export async function createSession(db: D1Database, userId: number): Promise<CreatedSession> {
  const id = randomId120();
  const secret = randomId120();
  const createdAt = nowSeconds();
  const expiresAt = createdAt + SESSION_IDLE_SECONDS;
  await insertSession(db, { id, secretHash: await sha256(secret), userId, createdAt, expiresAt });
  return { id, userId, createdAt, expiresAt, token: `${id}.${secret}` };
}

export interface ValidatedSession {
  session: Session;
  user: User;
  /** True when the expiry moved and the cookie must be re-sent. */
  refreshed: boolean;
}

/** Returns null for malformed, unknown, expired or forged tokens. */
export async function validateSessionToken(
  db: D1Database,
  token: string,
  now = nowSeconds(),
): Promise<ValidatedSession | null> {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) {
    return null;
  }
  const [, id = "", secret = ""] = match;
  const row = await findSession(db, id);
  if (!row) {
    return null;
  }
  if (!bytesEqual(await sha256(secret), row.secretHash)) {
    return null;
  }
  const absoluteEnd = row.createdAt + SESSION_ABSOLUTE_SECONDS;
  if (now >= row.expiresAt || now >= absoluteEnd) {
    await deleteSession(db, row.id);
    return null;
  }
  let expiresAt = row.expiresAt;
  let refreshed = false;
  if (expiresAt - now < REFRESH_THRESHOLD_SECONDS) {
    const next = Math.min(now + SESSION_IDLE_SECONDS, absoluteEnd);
    if (next > expiresAt) {
      expiresAt = next;
      refreshed = true;
      await updateSessionExpiry(db, row.id, expiresAt);
    }
  }
  return {
    session: { id: row.id, userId: row.userId, createdAt: row.createdAt, expiresAt },
    user: { id: row.userId, username: row.username },
    refreshed,
  };
}

export function setSessionCookie<E extends HonoEnv>(
  c: Context<E>,
  token: string,
  expiresAt: number,
): void {
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    maxAge: Math.max(0, expiresAt - nowSeconds()),
  });
}

export function clearSessionCookie<E extends HonoEnv>(c: Context<E>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
}

export const readSessionCookie = <E extends HonoEnv>(c: Context<E>): string | undefined =>
  getCookie(c, SESSION_COOKIE);

export { deleteSession };

export const purgeExpiredSessions = (db: D1Database, now = nowSeconds()) =>
  purgeSessionsStatement(db, now, SESSION_ABSOLUTE_SECONDS);

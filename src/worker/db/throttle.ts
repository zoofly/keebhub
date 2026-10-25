// auth_throttle: exact, cross-location counters for login and register
// abuse (plan §4). Checks are reads; counters are written only after
// Turnstile has passed, so failed bot checks cost no D1 writes.

import { ipKeyPart } from "../lib/ip";
import { nowSeconds } from "../lib/time";

export interface ThrottleRule {
  /** Attempts allowed in the window; reaching it locks the key. */
  max: number;
  windowSeconds: number;
  lockSeconds: number;
}

/**
 * Per username *and* client IP (/64 for IPv6): 10 failures in 15 minutes
 * lock that pair for 15 minutes. Keying on the pair means a stranger can't
 * lock someone out of their account by guessing wrong from elsewhere.
 */
export const LOGIN_USER_IP_RULE: ThrottleRule = { max: 10, windowSeconds: 900, lockSeconds: 900 };
/**
 * Per username from any IP: a backstop against distributed guessing. 100
 * failures in an hour lock the username for 15 minutes (and every further
 * failure in that hour re-locks it).
 */
export const LOGIN_USER_RULE: ThrottleRule = { max: 100, windowSeconds: 3600, lockSeconds: 900 };
/** Per IP: 30 failures in 15 minutes lock that IP for 15 minutes. */
export const LOGIN_IP_RULE: ThrottleRule = { max: 30, windowSeconds: 900, lockSeconds: 900 };
/** Per IP: 5 registrations an hour. */
export const REGISTER_IP_RULE: ThrottleRule = { max: 5, windowSeconds: 3600, lockSeconds: 3600 };
/**
 * Per session: 5 wrong passwords on the change-password or delete-account
 * forms in 15 minutes lock those forms for that session for 15 minutes.
 * Separate from login, so login lockouts never block them (and they never
 * lock login).
 */
export const ACCOUNT_SESSION_RULE: ThrottleRule = { max: 5, windowSeconds: 900, lockSeconds: 900 };

const LONGEST_WINDOW_SECONDS = 3600;

export const loginUserKey = (normalizedUsername: string) => `login:user:${normalizedUsername}`;
export const loginUserIpKey = (normalizedUsername: string, ip: string | null) =>
  `login:userip:${normalizedUsername}|${ipKeyPart(ip)}`;
export const accountSessionKey = (sessionId: string) => `account:session:${sessionId}`;
/** Per-IP keys use the IPv4 address or the IPv6 /64 (see lib/ip.ts). */
export const loginIpKey = (ip: string | null) => `login:ip:${ipKeyPart(ip)}`;
export const registerIpKey = (ip: string | null) => `register:ip:${ipKeyPart(ip)}`;

/**
 * Seconds until the longest active lock among up to three keys ends, or 0
 * if none is locked. (Fixed placeholders keep the SQL free of interpolation;
 * unused slots repeat the first key.)
 */
export async function lockedFor(
  db: D1Database,
  keys: readonly [string, string?, string?],
  now = nowSeconds(),
): Promise<number> {
  const [keyA, keyB = keyA, keyC = keyA] = keys;
  const row = await db
    .prepare(
      "SELECT max(locked_until) AS until FROM auth_throttle WHERE key IN (?, ?, ?) AND locked_until > ?",
    )
    .bind(keyA, keyB, keyC, now)
    .first<{ until: number | null }>();
  return row?.until ? row.until - now : 0;
}

/**
 * Counts one attempt against `key`. A new window starts when the old one has
 * passed; reaching `rule.max` sets the lock.
 */
export function recordAttemptStatement(
  db: D1Database,
  key: string,
  rule: ThrottleRule,
  now = nowSeconds(),
) {
  // In an UPSERT's SET clause every column reference is the old value.
  return db
    .prepare(
      `INSERT INTO auth_throttle (key, count, window_start, locked_until)
       VALUES (?1, 1, ?2, CASE WHEN ?4 <= 1 THEN ?2 + ?5 ELSE NULL END)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END,
         locked_until = CASE
           WHEN (CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END) >= ?4 THEN ?2 + ?5
           ELSE locked_until
         END`,
    )
    .bind(key, now, rule.windowSeconds, rule.max, rule.lockSeconds);
}

export function clearThrottleStatement(db: D1Database, key: string) {
  return db.prepare("DELETE FROM auth_throttle WHERE key = ?").bind(key);
}

/** Removes rows whose window and lock have both ended. */
export function purgeThrottleStatement(db: D1Database, now = nowSeconds()) {
  return db
    .prepare(
      "DELETE FROM auth_throttle WHERE window_start <= ? AND (locked_until IS NULL OR locked_until <= ?)",
    )
    .bind(now - LONGEST_WINDOW_SECONDS, now);
}

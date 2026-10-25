// Q-B2 (unit): the D1 auth_throttle counters.
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SESSION_RULE,
  accountSessionKey,
  clearThrottleStatement,
  LOGIN_IP_RULE,
  LOGIN_USER_IP_RULE,
  LOGIN_USER_RULE,
  lockedFor,
  loginIpKey,
  loginUserIpKey,
  loginUserKey,
  purgeThrottleStatement,
  recordAttemptStatement,
} from "../db/throttle";

const db = env.DB;
const T0 = 1_800_000_000;

const fail = (key: string, rule = LOGIN_USER_IP_RULE, now = T0) =>
  recordAttemptStatement(db, key, rule, now).run();

describe("auth_throttle", () => {
  it("locks a username + IP pair on the 10th failure for 15 minutes", async () => {
    const key = loginUserIpKey("victim", "192.0.2.9");
    for (let i = 0; i < 9; i += 1) {
      await fail(key);
    }
    expect(await lockedFor(db, [key, key], T0)).toBe(0);
    await fail(key);
    expect(await lockedFor(db, [key, key], T0)).toBe(900);
    expect(await lockedFor(db, [key, key], T0 + 899)).toBe(1);
    expect(await lockedFor(db, [key, key], T0 + 900)).toBe(0);
  });

  it("locks an IP on the 30th failure", async () => {
    const key = loginIpKey("192.0.2.1");
    for (let i = 0; i < 29; i += 1) {
      await fail(key, LOGIN_IP_RULE);
    }
    expect(await lockedFor(db, [key, key], T0)).toBe(0);
    await fail(key, LOGIN_IP_RULE);
    expect(await lockedFor(db, [key, key], T0)).toBe(900);
  });

  it("starts a new window once the old one has passed", async () => {
    const key = loginUserIpKey("slowpoke", "192.0.2.10");
    for (let i = 0; i < 9; i += 1) {
      await fail(key, LOGIN_USER_IP_RULE, T0);
    }
    await fail(key, LOGIN_USER_IP_RULE, T0 + 900);
    const row = await db
      .prepare("SELECT count, window_start FROM auth_throttle WHERE key = ?")
      .bind(key)
      .first();
    expect(row).toEqual({ count: 1, window_start: T0 + 900 });
    expect(await lockedFor(db, [key, key], T0 + 900)).toBe(0);
  });

  it("reports the longer of two locks", async () => {
    const userKey = loginUserKey("both");
    const ipKey = loginIpKey("192.0.2.2");
    for (let i = 0; i < 10; i += 1) {
      await fail(userKey, LOGIN_USER_RULE, T0);
    }
    for (let i = 0; i < 30; i += 1) {
      await fail(ipKey, LOGIN_IP_RULE, T0 + 100);
    }
    expect(await lockedFor(db, [userKey, ipKey], T0 + 100)).toBe(900);
  });

  it("clears a key", async () => {
    const key = loginUserKey("cleared");
    await fail(key);
    await clearThrottleStatement(db, key).run();
    expect(
      await db.prepare("SELECT 1 FROM auth_throttle WHERE key = ?").bind(key).first(),
    ).toBeNull();
  });

  it("backstops a username at 100 failures an hour", async () => {
    const key = loginUserKey("crowd-target");
    for (let i = 0; i < 99; i += 1) {
      await fail(key, LOGIN_USER_RULE, T0 + i);
    }
    expect(await lockedFor(db, [key], T0 + 99)).toBe(0);
    await fail(key, LOGIN_USER_RULE, T0 + 100);
    expect(await lockedFor(db, [key], T0 + 100)).toBe(900);
  });

  it("checks up to three keys at once", async () => {
    const a = loginUserIpKey("three", "192.0.2.11");
    const b = loginUserKey("three");
    const c = loginIpKey("192.0.2.11");
    for (let i = 0; i < 30; i += 1) {
      await fail(c, LOGIN_IP_RULE, T0 + 50);
    }
    expect(await lockedFor(db, [a, b, c], T0 + 50)).toBe(900);
    expect(await lockedFor(db, [a, b], T0 + 50)).toBe(0);
  });

  it("keys account forms per session, apart from login", () => {
    expect(accountSessionKey("abc")).toBe("account:session:abc");
    expect(ACCOUNT_SESSION_RULE).toEqual({ max: 5, windowSeconds: 900, lockSeconds: 900 });
  });

  it("purges only rows whose window and lock have ended", async () => {
    const old = loginUserKey("old");
    const locked = loginUserKey("stilllocked");
    const recent = loginUserKey("recent");
    await fail(old, LOGIN_USER_RULE, T0);
    for (let i = 0; i < 10; i += 1) {
      await fail(locked, LOGIN_USER_RULE, T0 + 3000);
    }
    await fail(recent, LOGIN_USER_RULE, T0 + 3500);
    await purgeThrottleStatement(db, T0 + 3700).run();
    const { results } = await db
      .prepare("SELECT key FROM auth_throttle WHERE key IN (?, ?, ?) ORDER BY key")
      .bind(old, locked, recent)
      .all();
    expect(results.map((r) => r.key)).toEqual([recent, locked].sort());
  });
});

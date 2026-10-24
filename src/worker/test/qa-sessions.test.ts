// QA: session lifetime and cookie behaviour (plan §4 "Sessions", amendments:
// 7 days sliding, 30-day absolute cap, revocable, stored server-side).
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  validateSessionToken,
} from "../auth/session";
import { nowSeconds } from "../lib/time";
import {
  api,
  GOOD_PASSWORD,
  loginUser,
  mockOutbound,
  registerUser,
  sessionCookie,
  sessionIdFrom,
  setCookieHeader,
} from "./helpers";

const db = env.DB;
const DAY = 86_400;
const HALF = SESSION_IDLE_SECONDS / 2;

beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

const tokenFrom = (cookie: string) => cookie.slice(cookie.indexOf("=") + 1);

const sessionRow = (id: string) =>
  db
    .prepare("SELECT created_at, expires_at FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ created_at: number; expires_at: number }>();

const setTimes = (id: string, createdAt: number, expiresAt: number) =>
  db
    .prepare("UPDATE sessions SET created_at = ?, expires_at = ? WHERE id = ?")
    .bind(createdAt, expiresAt, id)
    .run();

/** Cookie attributes, lower-cased names, from one Set-Cookie header. */
function attributes(header: string) {
  const [pair = "", ...rest] = header.split(";").map((part) => part.trim());
  const attrs = new Map<string, string>();
  for (const part of rest) {
    const [name = "", value = ""] = part.split("=");
    attrs.set(name.toLowerCase(), value);
  }
  return { pair, attrs };
}

function expectSessionCookieAttributes(header: string | undefined) {
  expect(header).toBeDefined();
  const { pair, attrs } = attributes(header ?? "");
  expect(pair.startsWith("__Host-keebhub_session=")).toBe(true);
  expect(attrs.get("path")).toBe("/");
  expect(attrs.has("secure")).toBe(true);
  expect(attrs.has("httponly")).toBe(true);
  expect(attrs.get("samesite")?.toLowerCase()).toBe("lax");
  // __Host- cookies must not have a Domain (browsers drop them otherwise).
  expect(attrs.has("domain")).toBe(false);
  return attrs;
}

describe("cookie attributes", () => {
  it("register, login, refresh and logout all send a valid __Host- cookie", async () => {
    const register = await api("/api/auth/register", {
      body: { username: "cookiejar", password: GOOD_PASSWORD, turnstileToken: "turnstile-pass" },
      ip: "192.0.2.10",
    });
    expect(register.status).toBe(201);
    const registered = expectSessionCookieAttributes(setCookieHeader(register));
    expect(Number(registered.get("max-age"))).toBeGreaterThanOrEqual(SESSION_IDLE_SECONDS - 5);
    expect(Number(registered.get("max-age"))).toBeLessThanOrEqual(SESSION_IDLE_SECONDS);

    const login = await loginUser("cookiejar");
    expect(login.status).toBe(200);
    const loggedIn = expectSessionCookieAttributes(setCookieHeader(login));
    expect(Number(loggedIn.get("max-age"))).toBeGreaterThanOrEqual(SESSION_IDLE_SECONDS - 5);

    const cookie = sessionCookie(login) ?? "";
    const id = sessionIdFrom(cookie);
    const now = nowSeconds();
    await setTimes(id, now - 4 * DAY, now + 3 * DAY);
    const refresh = await api("/api/auth/me", { cookie });
    expect(refresh.status).toBe(200);
    const refreshed = expectSessionCookieAttributes(setCookieHeader(refresh));
    // Same token, new lifetime: the refresh doesn't rotate the secret.
    expect(attributes(setCookieHeader(refresh) ?? "").pair).toBe(cookie);
    expect(Number(refreshed.get("max-age"))).toBeGreaterThanOrEqual(SESSION_IDLE_SECONDS - 5);

    const logout = await api("/api/auth/logout", { method: "POST", cookie });
    expect(logout.status).toBe(204);
    const cleared = expectSessionCookieAttributes(setCookieHeader(logout));
    expect(cleared.get("max-age")).toBe("0");
  });

  it("the token is <id>.<secret>, 120 bits each, and only SHA-256(secret) is stored", async () => {
    const { cookie } = await registerUser("tokenshape");
    const token = tokenFrom(cookie);
    expect(token).toMatch(/^[a-z2-7]{24}\.[a-z2-7]{24}$/);
    const [id, secret] = token.split(".");
    const row = await db
      .prepare("SELECT hex(secret_hash) AS h, length(secret_hash) AS n FROM sessions WHERE id = ?")
      .bind(id ?? "")
      .first<{ h: string; n: number }>();
    expect(row?.n).toBe(32);
    const expected = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))),
      (b) => b.toString(16).padStart(2, "0"),
    )
      .join("")
      .toUpperCase();
    expect(row?.h).toBe(expected);
    const dump = JSON.stringify((await db.prepare("SELECT * FROM sessions").all()).results);
    expect(dump).not.toContain(secret);
  });

  it("two sessions never share an id or a secret", async () => {
    const { cookie } = await registerUser("uniq");
    const tokens = new Set([tokenFrom(cookie)]);
    for (let i = 0; i < 5; i += 1) {
      tokens.add(tokenFrom(sessionCookie(await loginUser("uniq")) ?? ""));
    }
    expect(tokens.size).toBe(6);
    const parts = [...tokens].flatMap((t) => t.split("."));
    expect(new Set(parts).size).toBe(12);
  });
});

describe("sliding expiry", () => {
  it("doesn't refresh (no write, no cookie) while more than half the window is left", async () => {
    const { cookie } = await registerUser("fresh-session");
    const id = sessionIdFrom(cookie);
    const now = nowSeconds();
    await setTimes(id, now - DAY, now + HALF + 60);
    const res = await api("/api/postings", { cookie });
    expect(res.status).toBe(200);
    expect(setCookieHeader(res)).toBeUndefined();
    expect((await sessionRow(id))?.expires_at).toBe(now + HALF + 60);
  });

  it("refreshes to a full 7 days once under the half-life, on any API request", async () => {
    const { cookie } = await registerUser("stale-session");
    const id = sessionIdFrom(cookie);
    const now = nowSeconds();
    await setTimes(id, now - 4 * DAY, now + HALF - 60);
    // A public read counts as activity too.
    const res = await api("/api/postings", { cookie });
    expect(res.status).toBe(200);
    expect(setCookieHeader(res)).toBeDefined();
    const row = await sessionRow(id);
    expect(row?.expires_at).toBeGreaterThanOrEqual(now + SESSION_IDLE_SECONDS);
    expect(row?.expires_at).toBeLessThanOrEqual(nowSeconds() + SESSION_IDLE_SECONDS);
  });

  it("is rejected at exactly its expiry second, and the row is deleted", async () => {
    const { cookie } = await registerUser("edge-expiry");
    const id = sessionIdFrom(cookie);
    const row = await sessionRow(id);
    const createdAt = row?.created_at ?? 0;
    const expiresAt = row?.expires_at ?? 0;
    expect(await validateSessionToken(db, tokenFrom(cookie), expiresAt - 1)).not.toBeNull();
    // That call slid the expiry forward; put it back and try the boundary itself.
    await setTimes(id, createdAt, expiresAt);
    expect(await validateSessionToken(db, tokenFrom(cookie), expiresAt)).toBeNull();
    expect(await sessionRow(id)).toBeNull();
  });
});

describe("absolute cap", () => {
  it("a session used every day still ends 30 days after sign-in", async () => {
    const { cookie } = await registerUser("daily-user");
    const id = sessionIdFrom(cookie);
    const created = (await sessionRow(id))?.created_at ?? 0;
    const token = tokenFrom(cookie);
    let lastExpiry = 0;
    // Simulate a request every day for 31 days.
    for (let day = 1; day <= 31; day += 1) {
      const at = created + day * DAY;
      const result = await validateSessionToken(db, token, at);
      if (at >= created + SESSION_ABSOLUTE_SECONDS) {
        expect(result, `day ${day}`).toBeNull();
        break;
      }
      expect(result, `day ${day}`).not.toBeNull();
      lastExpiry = result?.session.expiresAt ?? 0;
      expect(lastExpiry).toBeLessThanOrEqual(created + SESSION_ABSOLUTE_SECONDS);
    }
    expect(lastExpiry).toBe(created + SESSION_ABSOLUTE_SECONDS);
    expect(await sessionRow(id)).toBeNull();
  });

  it("the refreshed cookie's Max-Age never runs past the cap", async () => {
    const { cookie } = await registerUser("cap-cookie");
    const id = sessionIdFrom(cookie);
    const now = nowSeconds();
    // Signed in 25 days ago, idle expiry in 1 day: the refresh stops at the
    // cap, 5 days from now, not 7.
    await setTimes(id, now - SESSION_ABSOLUTE_SECONDS + 5 * DAY, now + DAY);
    const res = await api("/api/auth/me", { cookie });
    expect(res.status).toBe(200);
    const maxAge = Number(attributes(setCookieHeader(res) ?? "").attrs.get("max-age"));
    expect(maxAge).toBeLessThanOrEqual(5 * DAY);
    expect(maxAge).toBeGreaterThan(5 * DAY - 10);
    expect((await sessionRow(id))?.expires_at).toBe(now + 5 * DAY);
  });
});

describe("rotation and revocation", () => {
  it("login with an existing session cookie revokes it and issues a new one", async () => {
    const { cookie: old } = await registerUser("rotator");
    const login = await loginUser("rotator", GOOD_PASSWORD, undefined, old);
    const fresh = sessionCookie(login);
    expect(fresh).not.toBeNull();
    expect(sessionIdFrom(fresh ?? "")).not.toBe(sessionIdFrom(old));
    expect((await api("/api/auth/me", { cookie: old })).status).toBe(401);
    expect((await api("/api/auth/me", { cookie: fresh })).status).toBe(200);
  });

  it("logging in as someone else from a signed-in browser ends the first session", async () => {
    const { cookie: alice } = await registerUser("swap-alice");
    await registerUser("swap-bob");
    const login = await loginUser("swap-bob", GOOD_PASSWORD, undefined, alice);
    expect(login.status).toBe(200);
    expect((await api("/api/auth/me", { cookie: alice })).status).toBe(401);
    const me = await api("/api/auth/me", { cookie: sessionCookie(login) });
    expect(((await me.json()) as { username: string }).username).toBe("swap-bob");
  });

  it("registering from a signed-in browser ends the first session", async () => {
    const { cookie: first } = await registerUser("reg-first");
    const res = await api("/api/auth/register", {
      body: { username: "reg-second", password: GOOD_PASSWORD, turnstileToken: "turnstile-pass" },
      ip: "192.0.2.77",
      cookie: first,
    });
    expect(res.status).toBe(201);
    expect((await api("/api/auth/me", { cookie: first })).status).toBe(401);
  });

  it("a failed login leaves the current session alone", async () => {
    const { cookie } = await registerUser("keepme");
    const bad = await loginUser("keepme", "not the password", undefined, cookie);
    expect(bad.status).toBe(401);
    expect(sessionCookie(bad)).toBeNull();
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });

  it("logout ends only this device's session", async () => {
    const { cookie: laptop } = await registerUser("twodevices");
    const phone = sessionCookie(await loginUser("twodevices"));
    expect((await api("/api/auth/logout", { method: "POST", cookie: laptop })).status).toBe(204);
    expect((await api("/api/auth/me", { cookie: laptop })).status).toBe(401);
    expect((await api("/api/auth/me", { cookie: phone })).status).toBe(200);
  });

  it("logout without a session still answers 204 and clears the cookie", async () => {
    const res = await api("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(204);
    expect(setCookieHeader(res)).toMatch(/Max-Age=0/);
  });

  it("logout needs a same-origin request (no CSRF logout)", async () => {
    const { cookie } = await registerUser("csrf-logout");
    const res = await api("/api/auth/logout", {
      method: "POST",
      cookie,
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });

  it("a password change revokes every other session, keeps this one, and its cookie is unchanged", async () => {
    const { cookie } = await registerUser("pw-rotate");
    const others = [
      sessionCookie(await loginUser("pw-rotate")),
      sessionCookie(await loginUser("pw-rotate")),
    ];
    const res = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: "brand new fake words" },
      cookie,
      ip: "192.0.2.99",
    });
    expect(res.status).toBe(204);
    expect(setCookieHeader(res)).toBeUndefined();
    for (const other of others) {
      expect((await api("/api/auth/me", { cookie: other })).status).toBe(401);
    }
    const { n } = (await db
      .prepare("SELECT count(*) AS n FROM sessions WHERE id = ?")
      .bind(sessionIdFrom(cookie))
      .first<{ n: number }>()) ?? { n: 0 };
    expect(n).toBe(1);
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });

  it("a session for a dead cookie is cleared from the browser on any API request", async () => {
    const { cookie } = await registerUser("dead-cookie");
    await api("/api/auth/logout", { method: "POST", cookie });
    const res = await api("/api/postings", { cookie });
    expect(res.status).toBe(200);
    expect(setCookieHeader(res)).toMatch(/Max-Age=0/);
  });
});

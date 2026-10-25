// Q-B2: registration, login, sessions, throttling, Turnstile, HIBP.
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, UserResponse } from "../../shared/schemas";
import { hashPassword, PBKDF2_ITERATIONS, peppersFromEnv } from "../auth/password";
import { nowSeconds } from "../lib/time";
import { BREACHED_PASSWORD_MESSAGE } from "../routes/auth";
import {
  api,
  FAIL_TOKEN,
  freshIp,
  GOOD_PASSWORD,
  loginUser,
  mockOutbound,
  PASS_TOKEN,
  registerUser,
  sessionCookie,
  setCookieHeader,
} from "./helpers";

const db = env.DB;

beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

const COUNT_SQL = {
  users: "SELECT count(*) AS n FROM users",
  sessions: "SELECT count(*) AS n FROM sessions",
  auth_throttle: "SELECT count(*) AS n FROM auth_throttle",
} as const;
const count = async (table: keyof typeof COUNT_SQL) =>
  (await db.prepare(COUNT_SQL[table]).first<{ n: number }>())?.n ?? 0;

const sessionIdFrom = (cookie: string) => cookie.split("=")[1]?.split(".")[0] ?? "";

describe("POST /api/auth/register", () => {
  it("creates the user, returns 201 {user} and signs them in", async () => {
    const res = await api("/api/auth/register", {
      body: { username: "Kash", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    expect(res.status).toBe(201);
    const body = UserResponse.parse(await res.json());
    expect(body.user.username).toBe("Kash");
    const cookie = sessionCookie(res);
    expect(cookie).not.toBeNull();
    const me = await api("/api/auth/me", { cookie });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ id: body.user.id, username: "Kash" });
  });

  it("validates the username and password", async () => {
    for (const body of [
      { username: "ab", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      { username: "has space", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      { username: "valid_name", password: "short", turnstileToken: PASS_TOKEN },
      { username: "valid_name", password: GOOD_PASSWORD },
    ]) {
      const res = await api("/api/auth/register", { body, ip: freshIp() });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("returns 409 for a duplicate, case-insensitively", async () => {
    await registerUser("Alice");
    for (const username of ["Alice", "alice", "ALICE"]) {
      const res = await api("/api/auth/register", {
        body: { username, password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
        ip: freshIp(),
      });
      expect(res.status).toBe(409);
      expect(ApiError.parse(await res.json()).error.code).toBe("conflict");
    }
  });

  it("rejects a breached password (HIBP hit)", async () => {
    vi.restoreAllMocks();
    mockOutbound({ pwned: ["password1234"] });
    const res = await api("/api/auth/register", {
      body: { username: "breached", password: "password1234", turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    expect(res.status).toBe(400);
    expect(ApiError.parse(await res.json()).error.fields?.password).toEqual([
      BREACHED_PASSWORD_MESSAGE,
    ]);
  });

  it("allows the password when HIBP is down (fail open)", async () => {
    vi.restoreAllMocks();
    const spy = mockOutbound({ pwned: ["password1234"], hibpDown: true });
    const res = await api("/api/auth/register", {
      body: { username: "hibpdown", password: "password1234", turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    expect(res.status).toBe(201);
    expect(spy.mock.calls.some(([input]) => String(input).includes("pwnedpasswords"))).toBe(true);
  });

  it("sends only the first 5 SHA-1 characters to HIBP", async () => {
    vi.restoreAllMocks();
    const spy = mockOutbound();
    await registerUser("kanon");
    const hibpCall = spy.mock.calls.find(([input]) => String(input).includes("pwnedpasswords"));
    expect(String(hibpCall?.[0])).toMatch(/\/range\/[0-9A-F]{5}$/);
  });

  it("fails Turnstile with 403 and writes nothing to D1", async () => {
    const before = await Promise.all([count("users"), count("sessions"), count("auth_throttle")]);
    const res = await api("/api/auth/register", {
      body: { username: "botty", password: GOOD_PASSWORD, turnstileToken: FAIL_TOKEN },
      ip: freshIp(),
    });
    expect(res.status).toBe(403);
    expect(ApiError.parse(await res.json()).error.code).toBe("forbidden");
    expect(sessionCookie(res)).toBeNull();
    const after = await Promise.all([count("users"), count("sessions"), count("auth_throttle")]);
    expect(after).toEqual(before);
  });

  it("fails closed when siteverify is unreachable", async () => {
    vi.restoreAllMocks();
    mockOutbound({ turnstileDown: true });
    const res = await api("/api/auth/register", {
      body: { username: "nobot", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    expect(res.status).toBe(403);
  });

  it("allows 5 registrations per IP per hour, then 429 with Retry-After", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}-reg`;
    for (let i = 0; i < 5; i += 1) {
      const res = await api("/api/auth/register", {
        body: { username: `iplimit${i}`, password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
        ip,
      });
      expect(res.status, `registration ${i + 1}`).toBe(201);
    }
    const res = await api("/api/auth/register", {
      body: { username: "iplimit5", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip,
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(3500);
    expect(ApiError.parse(await res.json()).error.code).toBe("rate_limited");
  });
});

describe("POST /api/auth/login", () => {
  it("returns 200 {user} and a new session cookie", async () => {
    await registerUser("logan");
    const res = await loginUser("LOGAN");
    expect(res.status).toBe(200);
    expect(UserResponse.parse(await res.json()).user.username).toBe("logan");
    expect(sessionCookie(res)).not.toBeNull();
  });

  it("sets a __Host- cookie with HttpOnly, Secure, SameSite=Lax and Path=/", async () => {
    await registerUser("cookies");
    const header = setCookieHeader(await loginUser("cookies")) ?? "";
    expect(header).toMatch(/^__Host-keebhub_session=[a-z2-7]{24}\.[a-z2-7]{24};/);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).not.toMatch(/Domain=/i);
    expect(header).toMatch(/Max-Age=604800/);
  });

  it("gives the same 401 body for a wrong password and an unknown user", async () => {
    await registerUser("realuser");
    const wrong = await loginUser("realuser", "not the password");
    const unknown = await loginUser("nosuchuser", "not the password");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.text()).toBe(await unknown.text());
    expect(sessionCookie(wrong)).toBeNull();
  });

  it("returns 400 for non-string credentials", async () => {
    const res = await api("/api/auth/login", {
      body: { username: ["kash"], password: { a: 1 }, turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    expect(res.status).toBe(400);
  });

  it("fails Turnstile with 403 and writes nothing to D1", async () => {
    await registerUser("turnlogin");
    const before = await Promise.all([count("users"), count("sessions"), count("auth_throttle")]);
    const res = await api("/api/auth/login", {
      body: { username: "turnlogin", password: GOOD_PASSWORD, turnstileToken: FAIL_TOKEN },
      ip: freshIp(),
    });
    expect(res.status).toBe(403);
    const after = await Promise.all([count("users"), count("sessions"), count("auth_throttle")]);
    expect(after).toEqual(before);
  });

  it("rotates the session: a new id on login, and the old session is revoked", async () => {
    const { cookie } = await registerUser("rotator");
    const res = await loginUser("rotator", GOOD_PASSWORD, freshIp(), cookie);
    const fresh = sessionCookie(res);
    expect(fresh).not.toBeNull();
    expect(sessionIdFrom(fresh ?? "")).not.toBe(sessionIdFrom(cookie));
    expect((await api("/api/auth/me", { cookie })).status).toBe(401);
    expect((await api("/api/auth/me", { cookie: fresh })).status).toBe(200);
  });

  it("locks a username for one IP after 10 failures there; other IPs still log in", async () => {
    await registerUser("locked");
    const ip = freshIp();
    for (let i = 0; i < 10; i += 1) {
      expect((await loginUser("locked", "wrong password", ip)).status, `attempt ${i + 1}`).toBe(
        401,
      );
    }
    // The 11th try from that IP is refused (the per-IP binding allows ten a
    // minute, and the username+IP lock is now set for 15 minutes).
    const res = await loginUser("LOCKED", GOOD_PASSWORD, ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(ApiError.parse(await res.json()).error.code).toBe("rate_limited");
    const row = await db
      .prepare("SELECT locked_until FROM auth_throttle WHERE key LIKE 'login:userip:locked|%'")
      .first<{ locked_until: number }>();
    expect(row?.locked_until).toBeGreaterThan(nowSeconds() + 800);
    expect((await loginUser("locked", GOOD_PASSWORD, freshIp())).status).toBe(200);
  });

  it("resets the username counter after a successful login", async () => {
    await registerUser("resetter");
    for (let i = 0; i < 9; i += 1) {
      await loginUser("resetter", "wrong password", freshIp());
    }
    expect((await loginUser("resetter")).status).toBe(200);
    for (let i = 0; i < 9; i += 1) {
      expect((await loginUser("resetter", "wrong password", freshIp())).status).toBe(401);
    }
    expect((await loginUser("resetter")).status).toBe(200);
  });

  it("re-hashes a password stored with outdated parameters", async () => {
    const { user } = await registerUser("rehash");
    const outdated = await hashPassword(GOOD_PASSWORD, peppersFromEnv(env), 1000);
    await db
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(outdated, user.id)
      .run();
    expect((await loginUser("rehash")).status).toBe(200);
    const row = await db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ password_hash: string }>();
    expect(row?.password_hash).toContain(`$i=${PBKDF2_ITERATIONS}$`);
    expect((await loginUser("rehash")).status).toBe(200);
  });
});

describe("sessions", () => {
  it("GET /api/auth/me is 401 when signed out", async () => {
    const res = await api("/api/auth/me");
    expect(res.status).toBe(401);
    expect(ApiError.parse(await res.json()).error.code).toBe("unauthorized");
  });

  it("rejects the token after logout", async () => {
    const { cookie } = await registerUser("leaver");
    const res = await api("/api/auth/logout", { method: "POST", cookie });
    expect(res.status).toBe(204);
    expect(setCookieHeader(res)).toMatch(/Max-Age=0/);
    expect((await api("/api/auth/me", { cookie })).status).toBe(401);
  });

  it("rejects a forged secret for a real session id", async () => {
    const { cookie } = await registerUser("forger");
    const forged = `${cookie.split(".")[0]}.${"a".repeat(24)}`;
    expect((await api("/api/auth/me", { cookie: forged })).status).toBe(401);
  });

  it("rejects an expired session and clears the cookie", async () => {
    const { cookie } = await registerUser("expired");
    await db
      .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(nowSeconds() - 1, sessionIdFrom(cookie))
      .run();
    const res = await api("/api/auth/me", { cookie });
    expect(res.status).toBe(401);
    expect(setCookieHeader(res)).toMatch(/Max-Age=0/);
    expect(
      await db.prepare("SELECT 1 FROM sessions WHERE id = ?").bind(sessionIdFrom(cookie)).first(),
    ).toBeNull();
  });

  it("slides the expiry only once past the half-life", async () => {
    const { cookie } = await registerUser("slider");
    const id = sessionIdFrom(cookie);
    const now = nowSeconds();
    const day = 86_400;

    await db
      .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(now + 4 * day, id)
      .run();
    const early = await api("/api/auth/me", { cookie });
    expect(early.status).toBe(200);
    expect(setCookieHeader(early)).toBeUndefined();
    let row = await db
      .prepare("SELECT expires_at FROM sessions WHERE id = ?")
      .bind(id)
      .first<{ expires_at: number }>();
    expect(row?.expires_at).toBe(now + 4 * day);

    await db
      .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(now + 3 * day, id)
      .run();
    const late = await api("/api/auth/me", { cookie });
    expect(late.status).toBe(200);
    expect(setCookieHeader(late)).toMatch(/Max-Age=60480\d|Max-Age=604799/);
    row = await db
      .prepare("SELECT expires_at FROM sessions WHERE id = ?")
      .bind(id)
      .first<{ expires_at: number }>();
    expect(row?.expires_at).toBeGreaterThanOrEqual(now + 7 * day);
  });

  it("never extends past the 30-day absolute cap", async () => {
    const { cookie } = await registerUser("capped");
    const id = sessionIdFrom(cookie);
    const now = nowSeconds();
    const day = 86_400;
    const createdAt = now - 29 * day;
    await db
      .prepare("UPDATE sessions SET created_at = ?, expires_at = ? WHERE id = ?")
      .bind(createdAt, now + day, id)
      .run();
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
    const row = await db
      .prepare("SELECT expires_at FROM sessions WHERE id = ?")
      .bind(id)
      .first<{ expires_at: number }>();
    expect(row?.expires_at).toBe(createdAt + 30 * day);

    await db
      .prepare("UPDATE sessions SET created_at = ? WHERE id = ?")
      .bind(now - 30 * day, id)
      .run();
    expect((await api("/api/auth/me", { cookie })).status).toBe(401);
  });

  it("never returns the password hash", async () => {
    const register = await api("/api/auth/register", {
      body: { username: "hashless", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    const cookie = sessionCookie(register);
    const bodies = [
      await register.text(),
      await (await loginUser("hashless")).text(),
      await (await api("/api/auth/me", { cookie })).text(),
    ];
    for (const body of bodies) {
      expect(body).not.toMatch(/pbkdf2|password/i);
    }
  });
});

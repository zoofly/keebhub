// Q-B4: change password, delete account, auth logs, cron purge.
import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../shared/schemas";
import { SESSION_ABSOLUTE_SECONDS } from "../auth/session";
import worker from "../index";
import { nowSeconds } from "../lib/time";
import {
  api,
  GOOD_PASSWORD,
  loginUser,
  mockOutbound,
  registerUser,
  sessionCookie,
  validPosting,
} from "./helpers";

const db = env.DB;
const NEW_PASSWORD = "other fake words";

beforeEach(() => {
  mockOutbound({ pwned: ["password1234"] });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/auth/password", () => {
  it("changes the password, keeps the current session and revokes the others", async () => {
    const { cookie: current } = await registerUser("changer");
    const other = sessionCookie(await loginUser("changer"));
    expect(other).not.toBeNull();

    const res = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD },
      cookie: current,
    });
    expect(res.status).toBe(204);

    expect((await api("/api/auth/me", { cookie: current })).status).toBe(200);
    expect((await api("/api/auth/me", { cookie: other })).status).toBe(401);
    expect((await loginUser("changer", GOOD_PASSWORD)).status).toBe(401);
    expect((await loginUser("changer", NEW_PASSWORD)).status).toBe(200);
  });

  it("returns 400 (not 401) for a wrong current password", async () => {
    const { cookie } = await registerUser("wrongcur");
    const res = await api("/api/auth/password", {
      body: { currentPassword: "not my password", newPassword: NEW_PASSWORD },
      cookie,
    });
    expect(res.status).toBe(400);
    expect(ApiError.parse(await res.json()).error.fields?.currentPassword).toBeDefined();
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });

  it("validates the new password and rejects breached ones", async () => {
    const { cookie } = await registerUser("newpw");
    const short = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: "short" },
      cookie,
    });
    expect(short.status).toBe(400);
    const breached = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: "password1234" },
      cookie,
    });
    expect(breached.status).toBe(400);
    expect(ApiError.parse(await breached.json()).error.fields?.newPassword).toBeDefined();
  });

  it("requires a session", async () => {
    const res = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/me", () => {
  it("deletes the account and cascades postings, saved rows and sessions", async () => {
    const { cookie, user } = await registerUser("leaving");
    const second = sessionCookie(await loginUser("leaving"));
    const { cookie: other } = await registerUser("staying");

    const mine = await api("/api/postings", { body: validPosting, cookie });
    const { id: myPostingId } = (await mine.json()) as { id: number };
    const theirs = await api("/api/postings", { body: validPosting, cookie: other });
    const { id: theirPostingId } = (await theirs.json()) as { id: number };
    await api(`/api/me/saved/${theirPostingId}`, { method: "PUT", cookie });
    await api(`/api/me/saved/${myPostingId}`, { method: "PUT", cookie: other });

    const res = await api("/api/me", {
      method: "DELETE",
      body: { password: GOOD_PASSWORD },
      cookie,
    });
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join()).toMatch(/Max-Age=0/);

    const counts = await db
      .prepare(
        `SELECT
           (SELECT count(*) FROM users WHERE id = ?1) AS users,
           (SELECT count(*) FROM sessions WHERE user_id = ?1) AS sessions,
           (SELECT count(*) FROM postings WHERE user_id = ?1) AS postings,
           (SELECT count(*) FROM saved_listings WHERE user_id = ?1) AS saved,
           (SELECT count(*) FROM saved_listings WHERE posting_id = ?2) AS savedByOthers`,
      )
      .bind(user.id, myPostingId)
      .first();
    expect(counts).toEqual({ users: 0, sessions: 0, postings: 0, saved: 0, savedByOthers: 0 });
    expect((await api("/api/auth/me", { cookie: second })).status).toBe(401);
    expect((await api(`/api/postings/${theirPostingId}`)).status).toBe(200);
  });

  it("returns 400 and keeps the account for a wrong password", async () => {
    const { cookie } = await registerUser("keeper");
    const res = await api("/api/me", {
      method: "DELETE",
      body: { password: "not my password" },
      cookie,
    });
    expect(res.status).toBe(400);
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });
});

describe("auth logs", () => {
  it("never contain passwords, tokens or cookies", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.spyOn(console, "info").mockImplementation(capture);

    const { cookie } = await registerUser("logged", GOOD_PASSWORD);
    await loginUser("logged", "a wrong password");
    const login = await loginUser("logged", GOOD_PASSWORD);
    const loginCookie = sessionCookie(login) ?? "";
    await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD },
      cookie,
    });
    await api("/api/me", { method: "DELETE", body: { password: "a wrong password" }, cookie });
    await api("/api/auth/logout", { method: "POST", cookie: loginCookie });

    const output = lines.join("\n");
    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const secret of [GOOD_PASSWORD, NEW_PASSWORD, "a wrong password", "logged"]) {
      expect(output).not.toContain(secret);
    }
    for (const token of [cookie, loginCookie]) {
      const value = token.split("=")[1] ?? "";
      expect(output).not.toContain(value);
      expect(output).not.toContain(value.split(".")[1] ?? "");
    }
    const events = lines.map((line) => JSON.parse(line) as { event?: string }).map((l) => l.event);
    expect(events).toEqual(
      expect.arrayContaining([
        "auth.register",
        "auth.login_failed",
        "auth.login",
        "auth.password_changed",
      ]),
    );
  });
});

describe("scheduled purge", () => {
  it("removes only expired sessions and finished throttle rows", async () => {
    const { user } = await registerUser("purger");
    const now = nowSeconds();
    const insert = (id: string, createdAt: number, expiresAt: number) =>
      db
        .prepare(
          "INSERT INTO sessions (id, secret_hash, user_id, created_at, expires_at) VALUES (?, zeroblob(32), ?, ?, ?)",
        )
        .bind(id, user.id, createdAt, expiresAt)
        .run();
    await insert("expiredidle", now - 100, now - 1);
    await insert("expiredabsolute", now - SESSION_ABSOLUTE_SECONDS - 1, now + 1000);
    await insert("stillvalid", now - 100, now + 1000);
    await db.batch([
      db
        .prepare(
          "INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES ('old', 1, ?, NULL)",
        )
        .bind(now - 7200),
      db
        .prepare(
          "INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES ('fresh', 1, ?, NULL)",
        )
        .bind(now - 60),
      db
        .prepare(
          "INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES ('stilllocked', 10, ?, ?)",
        )
        .bind(now - 7200, now + 600),
    ]);

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "17 3 * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);

    const sessions = await db
      .prepare(
        "SELECT id FROM sessions WHERE id IN ('expiredidle', 'expiredabsolute', 'stillvalid')",
      )
      .all<{ id: string }>();
    expect(sessions.results.map((r) => r.id)).toEqual(["stillvalid"]);
    const throttle = await db
      .prepare(
        "SELECT key FROM auth_throttle WHERE key IN ('old', 'fresh', 'stilllocked') ORDER BY key",
      )
      .all<{ key: string }>();
    expect(throttle.results.map((r) => r.key)).toEqual(["fresh", "stilllocked"]);
  });
});

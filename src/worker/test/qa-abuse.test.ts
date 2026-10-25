// QA: abuse controls (plan §4 "Rate limiting and abuse"): D1 throttles and
// lockouts with Retry-After, the per-IP rate-limit binding, Turnstile failing
// closed, HIBP failing open, and no D1 write before the bot check passes.
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIBP_RANGE_URL } from "../auth/hibp";
import { PBKDF2_ITERATIONS } from "../auth/password";
import { SITEVERIFY_URL, verifyTurnstile } from "../auth/turnstile";
import {
  ACCOUNT_SESSION_RULE,
  LOGIN_IP_RULE,
  LOGIN_USER_IP_RULE,
  LOGIN_USER_RULE,
  loginIpKey,
  loginUserIpKey,
  loginUserKey,
} from "../db/throttle";
import { nowSeconds } from "../lib/time";
import {
  api,
  dbSnapshot,
  expectApiError,
  FAIL_TOKEN,
  freshIp,
  GOOD_PASSWORD,
  loginUser,
  mockOutbound,
  OTHER_PASSWORD,
  PASS_TOKEN,
  registerUser,
  sessionCookie,
  WRONG_PASSWORD,
} from "./helpers";

const db = env.DB;

beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

const retryAfter = (res: Response) => Number(res.headers.get("retry-after"));

/** Seeds an auth_throttle row as if `count` failures had happened. */
async function seedFailures(key: string, count: number, lockedUntil: number | null = null) {
  await db
    .prepare(
      "INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES (?, ?, ?, ?)",
    )
    .bind(key, count, nowSeconds() - 60, lockedUntil)
    .run();
}

const throttleRow = (key: string) =>
  db
    .prepare("SELECT count, locked_until FROM auth_throttle WHERE key = ?")
    .bind(key)
    .first<{ count: number; locked_until: number | null }>();

describe("login lockout (per username + IP)", () => {
  it("10 failures from one IP lock that name for that IP, and nothing else", async () => {
    await registerUser("pair-locked");
    const attacker = freshIp();
    // Ten real failures from one IP: the Rate Limiting binding allows ten a
    // minute, so all of them reach the password check.
    for (let i = 0; i < LOGIN_USER_IP_RULE.max; i += 1) {
      expect((await loginUser("pair-locked", `wrong ${i}`, attacker)).status).toBe(401);
    }
    const row = await throttleRow(loginUserIpKey("pair-locked", attacker));
    expect(row?.count).toBe(LOGIN_USER_IP_RULE.max);
    expect(row?.locked_until).toBeGreaterThan(nowSeconds() + LOGIN_USER_IP_RULE.lockSeconds - 10);
    // The owner, from anywhere else, gets straight in: no weaponized lockout.
    expect((await loginUser("pair-locked", GOOD_PASSWORD, freshIp())).status).toBe(200);
  });

  it("a locked pair gets 429 + Retry-After even with the right password, and nothing is written", async () => {
    await registerUser("locked-out");
    const ip = "192.0.2.201";
    await seedFailures(
      loginUserIpKey("locked-out", ip),
      LOGIN_USER_IP_RULE.max,
      nowSeconds() + LOGIN_USER_IP_RULE.lockSeconds,
    );
    const before = await dbSnapshot(db);
    const warnings: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    });
    const res = await loginUser("locked-out", GOOD_PASSWORD, ip);
    await expectApiError(res, 429, "rate_limited");
    expect(retryAfter(res)).toBeGreaterThan(LOGIN_USER_IP_RULE.lockSeconds - 10);
    expect(retryAfter(res)).toBeLessThanOrEqual(LOGIN_USER_IP_RULE.lockSeconds);
    expect(sessionCookie(res)).toBeNull();
    expect(await dbSnapshot(db)).toEqual(before);
    // The lockout is logged (A09) with a username hash and the IP, never the name or password.
    const locked = warnings
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((e) => e.event === "auth.locked");
    expect(locked).toMatchObject({
      usernameHash: expect.stringMatching(/^[0-9a-f]{16}$/),
      ip,
    });
    expect(warnings.join("\n")).not.toMatch(/locked-out|fake test words/);
  });

  it("failures from many IPs don't lock the owner out below the backstop", async () => {
    await registerUser("spread-target");
    for (let i = 0; i < LOGIN_USER_IP_RULE.max + 5; i += 1) {
      expect((await loginUser("spread-target", `wrong ${i}`)).status).toBe(401);
    }
    expect((await loginUser("spread-target")).status).toBe(200);
  });

  it("counts every spelling of the name against one key", async () => {
    await registerUser("CaseLock");
    const ip = freshIp();
    const spellings = ["caselock", "CASELOCK", "CaseLock", "  caselock ", "cAsElOcK"];
    for (let i = 0; i < LOGIN_USER_IP_RULE.max; i += 1) {
      expect((await loginUser(spellings[i % spellings.length] ?? "", `nope ${i}`, ip)).status).toBe(
        401,
      );
    }
    const rows = await db
      .prepare("SELECT key, count FROM auth_throttle WHERE key LIKE 'login:%caselock%'")
      .all<{ key: string; count: number }>();
    expect(rows.results).toEqual(
      expect.arrayContaining([
        { key: loginUserIpKey("caselock", ip), count: LOGIN_USER_IP_RULE.max },
        { key: "login:user:caselock", count: LOGIN_USER_IP_RULE.max },
      ]),
    );
    expect(rows.results).toHaveLength(2);
  });

  it("locks unknown usernames the same way (no hint that a name exists)", async () => {
    const ip = freshIp();
    for (let i = 0; i < LOGIN_USER_IP_RULE.max; i += 1) {
      expect((await loginUser("nobody-here", `wrong ${i}`, ip)).status).toBe(401);
    }
    const row = await throttleRow(loginUserIpKey("nobody-here", ip));
    expect(row?.locked_until).toBeGreaterThan(nowSeconds());
  });

  it("opens again once the lock has passed; success clears that IP's count but not the backstop", async () => {
    await registerUser("unlocked");
    const ip = freshIp();
    await seedFailures(loginUserIpKey("unlocked", ip), LOGIN_USER_IP_RULE.max, nowSeconds() - 1);
    await seedFailures(loginUserKey("unlocked"), 12);
    expect((await loginUser("unlocked", GOOD_PASSWORD, ip)).status).toBe(200);
    expect(await throttleRow(loginUserIpKey("unlocked", ip))).toBeNull();
    expect((await throttleRow(loginUserKey("unlocked")))?.count).toBe(12);
  });
});

describe("login backstop (per username, any IP)", () => {
  it("100 failures in an hour from any IPs lock the name everywhere", async () => {
    await registerUser("backstopped");
    await seedFailures(loginUserKey("backstopped"), LOGIN_USER_RULE.max - 1);
    expect((await loginUser("backstopped", "wrong again")).status).toBe(401);
    const res = await loginUser("backstopped", GOOD_PASSWORD, freshIp());
    await expectApiError(res, 429, "rate_limited");
    expect(retryAfter(res)).toBeGreaterThan(LOGIN_USER_RULE.lockSeconds - 10);
    expect(retryAfter(res)).toBeLessThanOrEqual(LOGIN_USER_RULE.lockSeconds);
  });

  it("is far above the per-IP lock", () => {
    expect(LOGIN_USER_RULE.max).toBeGreaterThanOrEqual(10 * LOGIN_USER_IP_RULE.max);
    expect(LOGIN_USER_RULE.windowSeconds).toBe(3600);
  });
});

describe("password change and account deletion have their own per-session throttle", () => {
  it("5 wrong current passwords lock the forms for that session, but not login", async () => {
    const { cookie } = await registerUser("pw-guesser");
    for (let i = 0; i < ACCOUNT_SESSION_RULE.max; i += 1) {
      const res = await api("/api/auth/password", {
        body: { currentPassword: `guess ${i}`, newPassword: "fresh fake words" },
        cookie,
        ip: freshIp(),
      });
      expect(res.status, `guess ${i + 1}`).toBe(400);
    }
    const right = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: "fresh fake words" },
      cookie,
      ip: freshIp(),
    });
    await expectApiError(right, 429, "rate_limited");
    expect(retryAfter(right)).toBeGreaterThan(ACCOUNT_SESSION_RULE.lockSeconds - 10);
    // Deleting the account from that session is locked too.
    const del = await api("/api/me", {
      method: "DELETE",
      body: { password: GOOD_PASSWORD },
      cookie,
    });
    await expectApiError(del, 429, "rate_limited");
    // Login is unaffected, and the session itself is fine.
    expect((await loginUser("pw-guesser")).status).toBe(200);
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });

  it("wrong passwords on account deletion count too, and the account survives", async () => {
    const { cookie } = await registerUser("del-guesser");
    for (let i = 0; i < ACCOUNT_SESSION_RULE.max; i += 1) {
      const res = await api("/api/me", {
        method: "DELETE",
        body: { password: `guess ${i}` },
        cookie,
      });
      expect(res.status).toBe(400);
    }
    const right = await api("/api/me", {
      method: "DELETE",
      body: { password: GOOD_PASSWORD },
      cookie,
    });
    await expectApiError(right, 429, "rate_limited");
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });

  it("a login lockout doesn't block them", async () => {
    const { cookie } = await registerUser("still-mine");
    await seedFailures(loginUserKey("still-mine"), LOGIN_USER_RULE.max, nowSeconds() + 900);
    expect((await loginUser("still-mine")).status).toBe(429);
    const change = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: "fresh fake words" },
      cookie,
      ip: freshIp(),
    });
    expect(change.status).toBe(204);
    const del = await api("/api/me", {
      method: "DELETE",
      body: { password: "fresh fake words" },
      cookie,
    });
    expect(del.status).toBe(204);
  });
});

describe("login lockout (per IP)", () => {
  it("30 failures from one IP lock that IP for any username, but not other IPs", async () => {
    await registerUser("ip-victim");
    const ip = freshIp();
    // 29 earlier failures from this IP (the binding would stop real
    // requests from one IP after 10 a minute, so they're seeded).
    await db
      .prepare(
        "INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES (?, ?, ?, NULL)",
      )
      .bind(loginIpKey(ip), LOGIN_IP_RULE.max - 1, nowSeconds() - 60)
      .run();
    expect((await loginUser("someone-else", "wrong password", ip)).status).toBe(401);
    const locked = await loginUser("ip-victim", GOOD_PASSWORD, ip);
    await expectApiError(locked, 429, "rate_limited");
    expect(retryAfter(locked)).toBeGreaterThan(LOGIN_IP_RULE.lockSeconds - 10);
    expect((await loginUser("ip-victim", GOOD_PASSWORD, freshIp())).status).toBe(200);
  });
});

describe("rate-limit binding (about 10 a minute per IP on auth routes)", () => {
  it.each([
    [
      "login",
      "/api/auth/login",
      // A different name each time, so the per-username lock stays out of it.
      (i: number) => ({
        username: `nobody${i}`,
        password: OTHER_PASSWORD,
        turnstileToken: PASS_TOKEN,
      }),
    ],
    [
      "register",
      "/api/auth/register",
      (i: number) => ({ username: `x${i}`, password: "short", turnstileToken: PASS_TOKEN }),
    ],
  ])(
    "%s: past 10 requests in a minute from one IP it's a 429 with Retry-After",
    async (_label, path, body) => {
      const ip = freshIp();
      const statuses: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        statuses.push((await api(path, { body: body(i), ip })).status);
      }
      expect(statuses).not.toContain(429);
      const res = await api(path, { body: body(10), ip });
      await expectApiError(res, 429, "rate_limited");
      expect(retryAfter(res)).toBe(60);
      // Another IP is unaffected.
      expect((await api(path, { body: body(11), ip: freshIp() })).status).not.toBe(429);
    },
  );

  it("doesn't limit ordinary API reads", async () => {
    const ip = freshIp();
    for (let i = 0; i < 15; i += 1) {
      expect((await api("/api/postings", { ip })).status).toBe(200);
    }
  });
});

/** Replaces fetch: siteverify answers with `verify`, HIBP with no matches. */
function mockSiteverify(verify: (form: FormData) => Response | Promise<Response>) {
  vi.restoreAllMocks();
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === SITEVERIFY_URL) {
      return verify(await request.formData());
    }
    if (request.url.startsWith(HIBP_RANGE_URL)) {
      return new Response("0000000000000000000000000000000000A:0");
    }
    throw new Error(`unexpected fetch ${request.url}`);
  });
}

describe("Turnstile fails closed", () => {
  it.each([
    ["a 500 from siteverify", () => new Response("oops", { status: 500 })],
    ["a non-JSON reply", () => new Response("<html>")],
    ["success as a string", () => Response.json({ success: "true" })],
    ["no success field", () => Response.json({})],
    [
      "success: false",
      () => Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
    ],
  ])("%s means 403 and no D1 write, for register and login", async (_label, reply) => {
    mockSiteverify(reply);
    await db.prepare("INSERT INTO users (username, password_hash) VALUES ('tsuser', NULL)").run();
    const before = await dbSnapshot(db);
    const reg = await api("/api/auth/register", {
      body: { username: "ts-new", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    await expectApiError(reg, 403, "forbidden");
    const login = await api("/api/auth/login", {
      body: { username: "tsuser", password: WRONG_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    await expectApiError(login, 403, "forbidden");
    expect(await dbSnapshot(db)).toEqual(before);
    await db.prepare("DELETE FROM users WHERE username = 'tsuser'").run();
  });

  it("sends the secret, the token and the client IP to siteverify", async () => {
    const forms: FormData[] = [];
    mockSiteverify((form) => {
      forms.push(form);
      return Response.json({ success: true });
    });
    const res = await api("/api/auth/register", {
      body: { username: "ts-fields", password: GOOD_PASSWORD, turnstileToken: "token-abc" },
      ip: "192.0.2.55",
    });
    expect(res.status).toBe(201);
    expect(forms).toHaveLength(1);
    expect(forms[0]?.get("secret")).toBe(env.TURNSTILE_SECRET_KEY);
    expect(forms[0]?.get("response")).toBe("token-abc");
    expect(forms[0]?.get("remoteip")).toBe("192.0.2.55");
  });

  it("refuses without calling out when no secret is configured", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyTurnstile({ TURNSTILE_SECRET_KEY: "" }, "token", null)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a missing, empty or oversized token is a 400 before siteverify or D1", async () => {
    const spy = mockOutbound();
    const before = await dbSnapshot(db);
    for (const turnstileToken of [undefined, "", "t".repeat(2049), 42]) {
      const res = await api("/api/auth/login", {
        body: { username: "anyone", password: OTHER_PASSWORD, turnstileToken },
        ip: freshIp(),
      });
      await expectApiError(res, 400, "validation_failed");
    }
    expect(spy).not.toHaveBeenCalled();
    expect(await dbSnapshot(db)).toEqual(before);
  });

  it("a failed bot check on login doesn't count as a failed password", async () => {
    await registerUser("bot-target");
    for (let i = 0; i < LOGIN_USER_IP_RULE.max + 2; i += 1) {
      const res = await api("/api/auth/login", {
        body: { username: "bot-target", password: WRONG_PASSWORD, turnstileToken: FAIL_TOKEN },
        ip: freshIp(),
      });
      expect(res.status).toBe(403);
    }
    expect((await loginUser("bot-target")).status).toBe(200);
  });
});

describe("HIBP fails open", () => {
  const mockHibp = (reply: () => Response | Promise<Response>) => {
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.url === SITEVERIFY_URL) {
        return Response.json({ success: true });
      }
      if (request.url.startsWith(HIBP_RANGE_URL)) {
        return reply();
      }
      throw new Error(`unexpected fetch ${request.url}`);
    });
  };

  it.each([
    ["503", () => new Response("down", { status: 503 })],
    ["429", () => new Response("slow down", { status: 429 })],
    ["garbage body", () => new Response("<html>not a range</html>")],
    ["network error", () => Promise.reject(new TypeError("network down"))],
  ])("%s: registration and password change still go through", async (_label, reply) => {
    mockHibp(reply);
    const { cookie } = await registerUser(`hibp-${Math.random().toString(36).slice(2, 8)}`);
    const res = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: "another fake phrase" },
      cookie,
      ip: freshIp(),
    });
    expect(res.status).toBe(204);
  });

  it("asks with Add-Padding and ignores padding rows (count 0)", async () => {
    const urls: Request[] = [];
    vi.restoreAllMocks();
    const PADDED_PASSWORD = "padded fake words";
    const password = PADDED_PASSWORD;
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password))),
      (b) => b.toString(16).padStart(2, "0"),
    )
      .join("")
      .toUpperCase();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      urls.push(request);
      if (request.url === SITEVERIFY_URL) {
        return Response.json({ success: true });
      }
      // The real suffix appears, but only as a padding row.
      return new Response(`${digest.slice(5)}:0\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3`);
    });
    expect((await registerUser("padding-user", password)).user.username).toBe("padding-user");
    const hibp = urls.find((r) => r.url.startsWith(HIBP_RANGE_URL));
    expect(hibp?.url).toBe(`${HIBP_RANGE_URL}${digest.slice(0, 5)}`);
    expect(hibp?.headers.get("add-padding")).toBe("true");
  });

  it("isn't asked when the bot check fails or the name is taken", async () => {
    await registerUser("taken-name");
    const spy = mockOutbound();
    spy.mockClear();
    await api("/api/auth/register", {
      body: { username: "fresh-name", password: GOOD_PASSWORD, turnstileToken: FAIL_TOKEN },
      ip: freshIp(),
    });
    await api("/api/auth/register", {
      body: { username: "TAKEN-NAME", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: freshIp(),
    });
    const hibpCalls = spy.mock.calls.filter(([input]) =>
      String(input instanceof Request ? input.url : input).startsWith(HIBP_RANGE_URL),
    );
    expect(hibpCalls).toHaveLength(0);
  });
});

describe("no D1 write before the bot check", () => {
  it("validation failures, bot-check failures and throttled requests leave every table untouched", async () => {
    await registerUser("quota-user");
    const lockedIp = freshIp();
    await db
      .prepare(
        "INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES (?, 5, ?, ?)",
      )
      .bind(`register:ip:${lockedIp}`, nowSeconds(), nowSeconds() + 3600)
      .run();
    const before = await dbSnapshot(db);
    const attempts: [string, unknown, string][] = [
      [
        "/api/auth/register",
        { username: "x", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
        freshIp(),
      ],
      [
        "/api/auth/register",
        { username: "botreg", password: GOOD_PASSWORD, turnstileToken: FAIL_TOKEN },
        freshIp(),
      ],
      [
        "/api/auth/register",
        { username: "lockedreg", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
        lockedIp,
      ],
      [
        "/api/auth/login",
        { username: "quota-user", password: "wrong", turnstileToken: FAIL_TOKEN },
        freshIp(),
      ],
      ["/api/auth/login", { username: "quota-user", turnstileToken: PASS_TOKEN }, freshIp()],
      ["/api/auth/login", { username: "", password: "x", turnstileToken: PASS_TOKEN }, freshIp()],
    ];
    for (const [path, body, ip] of attempts) {
      const res = await api(path, { body, ip });
      expect([400, 403, 429], `${path} ${JSON.stringify(body)}`).toContain(res.status);
    }
    expect(await dbSnapshot(db)).toEqual(before);
  });
});

describe("no username enumeration", () => {
  it("an unknown username costs the same PBKDF2 work as a known one, and answers the same", async () => {
    await registerUser("enum-known");
    const derive = vi.spyOn(crypto.subtle, "deriveBits");
    const known = await loginUser("enum-known", "wrong password");
    const knownCalls = derive.mock.calls.map(
      ([params]) => (params as { iterations?: number }).iterations,
    );
    derive.mockClear();
    const unknown = await loginUser("enum-unknown", "wrong password");
    const unknownCalls = derive.mock.calls.map(
      ([params]) => (params as { iterations?: number }).iterations,
    );
    expect(knownCalls).toEqual([PBKDF2_ITERATIONS]);
    expect(unknownCalls).toEqual(knownCalls);
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
    expect([...unknown.headers.keys()].sort()).toEqual([...known.headers.keys()].sort());
  });
});

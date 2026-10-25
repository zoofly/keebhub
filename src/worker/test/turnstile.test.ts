// Turnstile: the token must be for this site (hostname) and this form (action).
import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSiteverify } from "../auth/turnstile";
import {
  api,
  dbSnapshot,
  expectApiError,
  freshIp,
  GOOD_PASSWORD,
  mockOutbound,
  PASS_TOKEN,
  registerUser,
} from "./helpers";

afterEach(() => vi.restoreAllMocks());

const quiet = () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};

const register = (username: string) =>
  api("/api/auth/register", {
    body: { username, password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
    ip: freshIp(),
  });

describe("siteverify hostname and action", () => {
  it.each([
    ["a token solved on another site", { hostname: "evil.example" }],
    ["no hostname", { hostname: undefined }],
    ["a login token used to register", { action: "login" }],
    ["no action", { action: undefined }],
    ["a test-key result on a real host", { metadata: { result_with_testing_key: true } }],
  ])("register refuses %s with 403 and writes nothing", async (_label, overrides) => {
    quiet();
    mockOutbound({ siteverify: overrides });
    const before = await dbSnapshot(env.DB);
    await expectApiError(await register("ts-mismatch"), 403, "forbidden");
    expect(await dbSnapshot(env.DB)).toEqual(before);
  });

  it("login refuses a register token and a token from another site", async () => {
    quiet();
    mockOutbound();
    await registerUser("ts-login");
    for (const overrides of [{ action: "register" }, { hostname: "evil.example" }]) {
      vi.restoreAllMocks();
      quiet();
      mockOutbound({ siteverify: overrides });
      const res = await api("/api/auth/login", {
        body: { username: "ts-login", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
        ip: freshIp(),
      });
      await expectApiError(res, 403, "forbidden");
    }
  });

  it("accepts the matching hostname in any case and the right action", async () => {
    mockOutbound({ siteverify: { hostname: "KEEBHUB.test" } });
    expect((await register("ts-case")).status).toBe(201);
  });

  it("accepts a test-key result only on localhost (local dev and e2e)", async () => {
    mockOutbound({
      siteverify: {
        hostname: "example.com",
        action: undefined,
        metadata: { result_with_testing_key: true },
      },
    });
    const res = await SELF.fetch("http://localhost/api/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "cf-connecting-ip": freshIp(),
      },
      body: JSON.stringify({
        username: "ts-local",
        password: GOOD_PASSWORD,
        turnstileToken: PASS_TOKEN,
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe("checkSiteverify", () => {
  const expected = { hostname: "keebhub.example.workers.dev", action: "login" as const };

  it("needs success, the hostname and the action", () => {
    quiet();
    expect(
      checkSiteverify({ success: true, hostname: expected.hostname, action: "login" }, expected),
    ).toBe(true);
    expect(
      checkSiteverify({ success: false, hostname: expected.hostname, action: "login" }, expected),
    ).toBe(false);
    expect(
      checkSiteverify({ success: true, hostname: "other.workers.dev", action: "login" }, expected),
    ).toBe(false);
    expect(
      checkSiteverify({ success: true, hostname: expected.hostname, action: "register" }, expected),
    ).toBe(false);
    expect(checkSiteverify({ success: true }, expected)).toBe(false);
  });

  it("refuses test-key results except on local hosts", () => {
    quiet();
    const testing = {
      success: true,
      hostname: "example.com",
      metadata: { result_with_testing_key: true },
    };
    expect(checkSiteverify(testing, expected)).toBe(false);
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(checkSiteverify(testing, { hostname, action: "register" }), hostname).toBe(true);
    }
  });
});

// QA: "every error path returns JSON {error}" (amendments), generic 5xx
// bodies (A05), the switch catalog order, and the no-SSRF invariant (the
// Worker never fetches user-supplied URLs).
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BODY_LIMIT_BYTES } from "../../shared/limits";
import { SwitchList } from "../../shared/schemas";
import {
  api,
  expectApiError,
  freshIp,
  GOOD_PASSWORD,
  mockOutbound,
  registerUser,
  validPosting,
} from "./helpers";

beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

describe("every error is JSON {error: {code, message}}", () => {
  it("for each status the API can produce", async () => {
    const { cookie } = await registerUser("errors-user");
    const ip = freshIp();
    const cases: [string, Parameters<typeof api>[1], number, string][] = [
      ["/api/postings/abc", {}, 400, "validation_failed"],
      ["/api/auth/me", {}, 401, "unauthorized"],
      [
        "/api/postings",
        { body: validPosting, origin: "https://evil.example", cookie },
        403,
        "forbidden",
      ],
      [
        "/api/auth/login",
        { body: { username: "errors-user", password: "x", turnstileToken: "turnstile-fail" }, ip },
        403,
        "forbidden",
      ],
      ["/api/nope", {}, 404, "not_found"],
      ["/api/postings", { method: "PATCH", body: validPosting, cookie }, 404, "not_found"],
      [
        "/api/auth/register",
        {
          body: {
            username: "Errors-User",
            password: GOOD_PASSWORD,
            turnstileToken: "turnstile-pass",
          },
          ip: freshIp(),
        },
        409,
        "conflict",
      ],
      [
        "/api/postings",
        { rawBody: "x".repeat(BODY_LIMIT_BYTES + 1), contentType: "application/json", cookie },
        413,
        "payload_too_large",
      ],
      [
        "/api/postings",
        { rawBody: "title=x", contentType: "application/x-www-form-urlencoded", cookie },
        415,
        "unsupported_media_type",
      ],
    ];
    for (const [path, options, status, code] of cases) {
      const res = await api(path, options);
      const body = await expectApiError(res, status, code);
      expect(body.error.message.length, path).toBeGreaterThan(0);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("content-security-policy")).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
    }
  });

  it("a 429 from the throttle is JSON with Retry-After", async () => {
    const ip = freshIp();
    await env.DB.prepare(
      "INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES (?, 5, ?, ?)",
    )
      .bind(`register:ip:${ip}`, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 60)
      .run();
    const res = await api("/api/auth/register", {
      body: {
        username: "throttled",
        password: GOOD_PASSWORD,
        turnstileToken: "turnstile-pass",
      },
      ip,
    });
    await expectApiError(res, 429, "rate_limited");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("a database failure is a generic 500 that leaks nothing, and health says 503", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    vi.spyOn(env.DB, "prepare").mockImplementation(() => {
      throw new Error("D1_ERROR: no such table: secret_internal_detail");
    });
    const res = await api("/api/switches");
    const body = await expectApiError(res, 500, "internal");
    expect(body.error.message).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("secret_internal_detail");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const health = await api("/api/health");
    await expectApiError(health, 503, "unavailable");
    // Logged server-side, with the method and path but no request body.
    expect(errors.join("\n")).toContain('"path":"/api/switches"');
  });
});

describe("GET /api/switches", () => {
  it("is ordered by name, ignoring case", async () => {
    const { items } = SwitchList.parse(await (await api("/api/switches")).json());
    const names = items.map((s) => s.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
  });
});

describe("no SSRF", () => {
  it("creating, editing and listing postings never fetches the image URL", async () => {
    const spy = mockOutbound();
    const { cookie } = await registerUser("ssrf-user");
    spy.mockClear();
    const internal = "https://169.254.169.254/latest/meta-data/";
    const created = await api("/api/postings", {
      body: { ...validPosting, imageUrl: internal },
      cookie,
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: number };
    await api(`/api/postings/${id}`, {
      method: "PUT",
      body: { ...validPosting, imageUrl: "https://localhost/admin" },
      cookie,
    });
    await api(`/api/postings/${id}`);
    await api("/api/postings");
    expect(spy).not.toHaveBeenCalled();
  });
});

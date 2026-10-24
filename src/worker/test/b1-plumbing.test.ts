// Q-B1: API plumbing (headers, content types, origin check, errors, switches).
import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BODY_LIMIT_BYTES } from "../../shared/limits";
import { ApiError, SwitchList } from "../../shared/schemas";
import { api, freshIp, mockOutbound, ORIGIN, registerUser, validPosting } from "./helpers";

beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

const expectApiError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status);
  expect(res.headers.get("content-type")).toContain("application/json");
  const body = ApiError.parse(await res.json());
  expect(body.error.code).toBe(code);
  return body;
};

describe("security headers", () => {
  it("are set on API responses", async () => {
    const res = await api("/api/health");
    const h = res.headers;
    expect(h.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("strict-transport-security")).toContain("max-age=");
    expect(h.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(h.get("referrer-policy")).toBe("no-referrer");
    expect(h.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(h.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("also apply to error responses", async () => {
    const res = await api("/api/nope");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("make responses no-store unless a route opts into caching", async () => {
    expect((await api("/api/postings")).headers.get("cache-control")).toBe("no-store");
    expect((await api("/api/nope")).headers.get("cache-control")).toBe("no-store");
    expect((await api("/api/switches")).headers.get("cache-control")).toBe("public, max-age=300");
  });
});

describe("JSON-only bodies", () => {
  it("returns 415 for form-encoded bodies", async () => {
    const res = await api("/api/auth/login", {
      rawBody: "username=a&password=b",
      contentType: "application/x-www-form-urlencoded",
    });
    await expectApiError(res, 415, "unsupported_media_type");
  });

  it("returns 415 for text/plain and multipart bodies", async () => {
    await expectApiError(
      await api("/api/auth/login", { rawBody: "{}", contentType: "text/plain" }),
      415,
      "unsupported_media_type",
    );
    await expectApiError(
      await api("/api/auth/login", {
        rawBody: "x",
        contentType: "multipart/form-data; boundary=x",
      }),
      415,
      "unsupported_media_type",
    );
  });

  it("returns 415 for a body with no Content-Type", async () => {
    await expectApiError(
      await api("/api/auth/login", { rawBody: "{}", contentType: null }),
      415,
      "unsupported_media_type",
    );
  });

  it("accepts application/json with a charset", async () => {
    const res = await api("/api/auth/login", {
      rawBody: "{}",
      contentType: "application/json; charset=utf-8",
    });
    await expectApiError(res, 400, "validation_failed");
  });

  it("allows a bodyless PUT with no Content-Type", async () => {
    const { cookie } = await registerUser("bodyless");
    const created = await api("/api/postings", { body: validPosting, cookie });
    const { id } = (await created.json()) as { id: number };
    const res = await api(`/api/me/saved/${id}`, { method: "PUT", cookie });
    expect(res.status).toBe(201);
  });
});

describe("origin check", () => {
  it("returns 403 for a cross-origin Origin on POST", async () => {
    const res = await api("/api/auth/login", {
      body: { username: "a", password: "b", turnstileToken: "t" },
      origin: "https://evil.example",
    });
    await expectApiError(res, 403, "forbidden");
  });

  it("returns 403 for cross-site Sec-Fetch-Site without a matching Origin", async () => {
    const res = await api("/api/auth/logout", {
      method: "POST",
      origin: null,
      headers: { "sec-fetch-site": "cross-site" },
    });
    await expectApiError(res, 403, "forbidden");
  });

  it("returns 403 when neither Origin nor Sec-Fetch-Site is sent", async () => {
    const res = await api("/api/auth/logout", { method: "POST", origin: null });
    await expectApiError(res, 403, "forbidden");
  });

  it("accepts Sec-Fetch-Site: same-origin", async () => {
    const res = await api("/api/auth/logout", {
      method: "POST",
      origin: null,
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect(res.status).toBe(204);
  });

  it("does not apply to GET", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/health`, {
      headers: { origin: "https://evil.example" },
    });
    expect(res.status).toBe(200);
  });
});

describe("error responses", () => {
  it("malformed JSON returns 400", async () => {
    const res = await api("/api/auth/login", { rawBody: "{bad", contentType: "application/json" });
    await expectApiError(res, 400, "validation_failed");
  });

  it("an oversized body returns 413", async () => {
    const res = await api("/api/auth/login", {
      rawBody: JSON.stringify({ username: "x".repeat(BODY_LIMIT_BYTES + 10) }),
      contentType: "application/json",
    });
    await expectApiError(res, 413, "payload_too_large");
  });

  it("an unknown route returns a JSON 404", async () => {
    await expectApiError(await api("/api/does-not-exist"), 404, "not_found");
    await expectApiError(await api("/api/postings/1/extra"), 404, "not_found");
  });

  it("validation errors list the fields", async () => {
    const res = await api("/api/auth/register", {
      body: { username: "x", password: "short", turnstileToken: "t" },
      ip: freshIp(),
    });
    const body = await expectApiError(res, 400, "validation_failed");
    expect(Object.keys(body.error.fields ?? {}).sort()).toEqual(["password", "username"]);
  });
});

describe("GET /api/switches", () => {
  it("returns the seeded catalog with a cache header", async () => {
    const res = await api("/api/switches");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const body = SwitchList.parse(await res.json());
    expect(body.items).toHaveLength(20);
    expect(body.items[0]).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
      manufacturer: expect.any(String),
      type: expect.stringMatching(/^(linear|tactile|clicky)$/),
      description: "",
      imageUrl: null,
    });
  });
});

describe("GET /api/config", () => {
  it("returns the public Turnstile site key", async () => {
    const res = await api("/api/config");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ turnstileSiteKey: expect.any(String) });
  });
});

describe("cookies and caching", () => {
  it("a response that sets the session cookie is never publicly cacheable", async () => {
    const { cookie } = await registerUser("cachecookie");
    const id = cookie.split("=")[1]?.split(".")[0] ?? "";
    // Past the half-life, so the next request refreshes the cookie.
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(Math.floor(Date.now() / 1000) + 3600, id)
      .run();
    const refreshed = await api("/api/switches", { cookie });
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.getSetCookie().join()).toMatch(/^__Host-keebhub_session=[a-z2-7]/);
    expect(refreshed.headers.get("cache-control")).toBe("no-store");
    // Once refreshed, the same cookie gets the normal public response.
    const again = await api("/api/switches", { cookie });
    expect(again.headers.getSetCookie()).toEqual([]);
    expect(again.headers.get("cache-control")).toBe("public, max-age=300");
    // A dead cookie is cleared (Set-Cookie with Max-Age=0): not cacheable either.
    const dead = await api("/api/config", {
      cookie: `__Host-keebhub_session=${"a".repeat(24)}.${"a".repeat(24)}`,
    });
    expect(dead.headers.getSetCookie().join()).toMatch(/Max-Age=0/);
    expect(dead.headers.get("cache-control")).toBe("no-store");
    // Without a cookie the public cache header stays.
    expect((await api("/api/config")).headers.get("cache-control")).toBe("public, max-age=300");
  });
});

describe("anonymous responses", () => {
  it("set no cookie", async () => {
    for (const path of [
      "/api/health",
      "/api/switches",
      "/api/postings",
      "/api/config",
      "/api/nope",
    ]) {
      const res = await api(path);
      expect(res.headers.getSetCookie(), path).toEqual([]);
    }
  });
});

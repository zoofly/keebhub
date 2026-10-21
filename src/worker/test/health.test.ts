import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok with no-store", async () => {
    const res = await SELF.fetch("https://keebhub.test/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("unknown API routes", () => {
  it("return a JSON 404", async () => {
    const res = await SELF.fetch("https://keebhub.test/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
  });
});

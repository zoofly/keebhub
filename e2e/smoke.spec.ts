import { expect, test } from "@playwright/test";

// Phase 0 smoke checks against the real Worker (API requests from Playwright's
// `request` fixture bypass the SPA's MSW mocks).

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Keebhub" })).toBeVisible();
});

test("GET /api/health returns ok and is not cached", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("no-store");
  expect(await res.json()).toEqual({ status: "ok" });
});

test("a deep link to a client route is served index.html", async ({ request }) => {
  const res = await request.get("/market", { headers: { accept: "text/html" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/html");
  expect(await res.text()).toContain('<div id="root"></div>');
});

test("an unknown /api route returns a JSON 404", async ({ request }) => {
  const res = await request.get("/api/x");
  expect(res.status()).toBe(404);
  expect(res.headers()["content-type"]).toContain("application/json");
  expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
});

test("static assets get the security headers and the Report-Only CSP", async ({ request }) => {
  const res = await request.get("/");
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  const csp = headers["content-security-policy-report-only"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
  expect(csp).toContain("frame-src https://challenges.cloudflare.com");
  expect(csp).toContain("img-src 'self' https: data:");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).not.toMatch(/(^|[\s;])http:/);
});

import { expect, test } from "@playwright/test";

// Smoke checks against the real Worker. Header checks live in
// security-headers.spec.ts.

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

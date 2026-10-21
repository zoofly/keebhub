import { expect, test } from "@playwright/test";

test("home page renders and reaches the API", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "keebhub" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("API: ok");
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

test("static assets get the security headers from _headers", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
});

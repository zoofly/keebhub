import { expect, test } from "./fixtures";
import { TURNSTILE_DUMMY_TOKEN, uniqueName } from "./support";

// Q-C: security headers on the SPA (public/_headers) and the API (Hono).

const EXPECTED_CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self'",
  "img-src 'self' https: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

test("/ is served with the enforced CSP and the static security headers", async ({ request }) => {
  for (const path of ["/", "/market", "/mylistings"]) {
    const res = await request.get(path, { headers: { accept: "text/html" } });
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers["content-security-policy"], path).toBe(EXPECTED_CSP);
    expect(headers["content-security-policy-report-only"]).toBeUndefined();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  }
  expect(EXPECTED_CSP).not.toMatch(/unsafe-inline|unsafe-eval|worker-src|(^|[\s;])http:/);
});

test("the CSP is enforced, and the suite catches violations", async ({ page, consoleIssues }) => {
  await page.goto("/");
  const ran = await page.evaluate(async () => {
    const w = window as unknown as { __inlineRan?: boolean };
    const script = document.createElement("script");
    script.textContent = "window.__inlineRan = true";
    document.head.append(script);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return w.__inlineRan === true;
  });
  expect(ran, "inline script must be blocked").toBe(false);
  await expect.poll(() => consoleIssues.length).toBeGreaterThan(0);
  expect(consoleIssues.map((issue) => issue.text).join("\n")).toMatch(/script-src/);
  // Expected here; don't fail the test for it.
  consoleIssues.length = 0;
});

test("hashed assets are immutable", async ({ page, request }) => {
  await page.goto("/");
  const script = await page.locator('script[type="module"]').first().getAttribute("src");
  expect(script).toMatch(/^\/assets\//);
  const res = await request.get(script ?? "");
  expect(res.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});

test("/api/auth/me has the API headers, signed out and signed in", async ({ page }) => {
  await page.goto("/");
  const check = (headers: Record<string, string>) => {
    expect(headers["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(headers["cache-control"]).toBe("no-store");
  };

  const guest = await page.request.get("/api/auth/me");
  expect(guest.status()).toBe(401);
  expect(await guest.json()).toEqual({
    error: { code: "unauthorized", message: "Sign in required" },
  });
  check(guest.headers());

  const origin = new URL(page.url()).origin;
  const register = await page.request.post("/api/auth/register", {
    headers: { origin },
    data: {
      username: uniqueName("headers"),
      password: "fake test words",
      turnstileToken: TURNSTILE_DUMMY_TOKEN,
    },
  });
  expect(register.status()).toBe(201);
  const cookie = register.headers()["set-cookie"] ?? "";
  expect(cookie).toMatch(/^__Host-keebhub_session=/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  expect(cookie).toMatch(/SameSite=Lax/i);

  const member = await page.request.get("/api/auth/me");
  expect(member.status()).toBe(200);
  check(member.headers());
});

test("cross-origin writes are refused", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.post("/api/auth/logout", {
    headers: { origin: "https://evil.example" },
  });
  expect(res.status()).toBe(403);
});

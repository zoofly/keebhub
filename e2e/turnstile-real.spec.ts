import { expect, test } from "@playwright/test";
import "./fixtures"; // window typings
import { uniqueName } from "./support";

// The real Turnstile widget with Cloudflare's always-pass TEST site key (from
// GET /api/config; e2e/server.ts sets it), loaded under the enforced CSP; the
// Worker verifies its dummy token with the matching test secret. Needs network
// access to challenges.cloudflare.com, so it runs once (desktop) and can be
// skipped offline with SKIP_REAL_TURNSTILE=1.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, "runs once, at desktop width");
test.skip(Boolean(process.env.SKIP_REAL_TURNSTILE), "offline");

test("the real widget loads under the CSP and its token is accepted", async ({ page }) => {
  // No cf-connecting-ip override here: it would also go to Cloudflare, which
  // refuses client-supplied values. This test registers once, from 127.0.0.1.
  const csp: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) csp.push(message.text());
  });
  await page.goto("/register");
  const form = page.getByRole("form", { name: "Create an account" });
  // The widget's iframe lives in a closed shadow root, so check the outcome:
  // the script loaded, and a token it issued gets the account created.
  await expect
    .poll(() => page.evaluate(() => typeof window.turnstile), { timeout: 20_000 })
    .toBe("object");
  await form.getByLabel("Username").fill(uniqueName("turnstile"));
  await form.getByLabel("Password").fill("correct horse battery");
  // The test key passes automatically; wait for the token, then submit.
  await expect(async () => {
    await form.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/market$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  expect(csp).toEqual([]);
});

import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  logOutInUi,
  mainNav,
  openMenuIfNeeded,
  prepareContext,
  throttleCpu,
  watchConsole,
} from "./fixtures";

// The 18 legacy acceptance flows (docs/legacy-acceptance/e2e-legacy.js),
// ported to the new app and run in order on one page against the real API,
// at both widths (the desktop and mobile projects). Differences from the legacy behaviour are
// noted where they are deliberate (plan decisions):
// - URLs are real paths, not /#/...; the market is public (browse logged out).
// - sweetalert modals became toasts and a native <dialog> confirm.
// - The edit form is a page (/market/:id/edit), not a dialog.
// - Success lands on the new listing's page; the market shows it first.

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let issues: ReturnType<typeof watchConsole>;
const username = `e2e_${Date.now().toString(36)}`;
// Obviously fake test-only value.
const password = "correct-horse-battery";
const apiLog: string[] = [];
const dialogs: string[] = [];

test.beforeAll(async ({ browser }, info) => {
  const { baseURL, viewport, hasTouch } = info.project.use;
  context = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    ...(viewport ? { viewport } : {}),
    hasTouch: Boolean(hasTouch),
  });
  await prepareContext(context);
  page = await context.newPage();
  await throttleCpu(page);
  issues = watchConsole(page);
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      apiLog.push(`${request.method()} ${url.pathname}`);
    }
  });
});

test.afterAll(async () => {
  expect(issues, "console errors / CSP reports").toEqual([]);
  await context.close();
});

const cards = () => page.getByTestId("listing-card");
const loginForm = () => page.getByRole("form", { name: "Log in" });

test("1. guest landing renders", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Keebhub" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("2. guest deep link: /market is public now; /mylistings asks to log in", async () => {
  await page.goto("/market");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Market" })).toBeVisible();
  await page.goto("/mylistings");
  await expect(page).toHaveURL(/\/login\?next=%2Fmylistings$/);
  await expect(loginForm()).toBeVisible();
});

test("3. a non-hash path (/about) serves the SPA", async () => {
  const response = await page.goto("/about");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("banner")).toBeVisible();
});

test("4. register: too-short password blocked client-side", async () => {
  await page.goto("/register");
  const form = page.getByRole("form", { name: "Create an account" });
  const before = apiLog.length;
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill("short");
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(form.getByText("Password must be at least 8 characters")).toBeVisible();
  expect(apiLog.slice(before).some((line) => line.includes("/register"))).toBe(false);
});

test("5. register: duplicate username shows a message", async () => {
  const form = page.getByRole("form", { name: "Create an account" });
  await form.getByLabel("Username").fill("bench");
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(form.getByRole("alert")).toContainText(/taken/i);
});

test("6. register: new account is signed in and lands on the market", async () => {
  const form = page.getByRole("form", { name: "Create an account" });
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/market$/);
  await expect(page.getByRole("heading", { level: 1, name: "Market" })).toBeVisible();
  await openMenuIfNeeded(page);
  await expect(mainNav(page).getByRole("button", { name: "Log out" })).toBeVisible();
});

test("7. market lists postings with formatted prices, no foreign edit buttons", async () => {
  await page.goto("/market");
  await expect(cards()).toHaveCount(12);
  for (const price of await page.getByTestId("listing-price").allTextContents()) {
    expect(price).toMatch(/^\$[\d,]+\.\d\d$|^Free \/ trade$/);
  }
  await expect(page.getByRole("link", { name: /^Edit/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("8. create: javascript: image URL rejected client-side", async () => {
  await page.goto("/create");
  await page.getByLabel("Title").fill("E2E <b>board</b>");
  await page.getByLabel("Photo URL").fill("javascript:alert(1)");
  await page.getByLabel("Price (USD)").fill("12.5");
  await page.getByLabel("Description").fill("<img src=x onerror=alert(1)> desc");
  const before = apiLog.length;
  await page.getByRole("button", { name: "Post listing" }).click();
  await expect(page.getByText("Image URL must be an https:// link")).toBeVisible();
  expect(apiLog.slice(before).some((line) => line.startsWith("POST /api/postings"))).toBe(false);
  await expectNoHorizontalScroll(page);
});

test("9. create: a valid listing posts and shows first on the market", async () => {
  await page.getByLabel("Photo URL").fill("https://img.keebhub.test/e2e.svg");
  await page.getByRole("button", { name: "Post listing" }).click();
  await expect(page.getByText("Listing posted!")).toBeVisible();
  await page.goto("/market");
  const first = cards().first();
  await expect(first).toContainText("E2E <b>board</b>");
  await expect(first).toContainText("$12.50");
  await expect(first.getByRole("link", { name: /^Edit/ })).toHaveCount(1);
});

test("10. edit: the form pre-fills the price as dollars and saves", async () => {
  await page.goto("/mylistings");
  await cards().first().getByRole("link", { name: /^Edit/ }).click();
  await expect(page.getByLabel("Price (USD)")).toHaveValue("12.50");
  await page.getByLabel("Title").fill("E2E board edited");
  await page.getByLabel("Price (USD)").fill("15");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Listing updated")).toBeVisible();
  await page.goto("/mylistings");
  await expect(cards().first()).toContainText("E2E board edited");
  await expect(cards().first()).toContainText("$15.00");
});

test("11. stored XSS payloads render as text (no dialog)", async () => {
  await page.goto("/market");
  await expect(cards().first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(dialogs).toEqual([]);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test("12. deep link reload keeps the session", async () => {
  await page.goto("/mylistings");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "My listings" })).toBeVisible();
  await expect(cards().first()).toBeVisible();
});

test("13. delete: own listing deleted", async () => {
  await cards()
    .first()
    .getByRole("button", { name: /^Delete/ })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete listing" }).click();
  await expect(page.getByText("Listing deleted")).toBeVisible();
  await expect(page.getByText("You haven't listed anything yet")).toBeVisible();
});

test("14. expired session drops to login without a request loop", async () => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: /^Hi/ })).toBeVisible();
  // The session ends (as if it expired): the browser loses its cookie.
  await context.clearCookies();
  const before = apiLog.length;
  await openMenuIfNeeded(page);
  await mainNav(page).getByRole("link", { name: "My listings" }).click();
  await expect(loginForm()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(apiLog.length - before).toBeLessThan(6);
});

test("15. login: wrong password message", async () => {
  await page.goto("/login");
  await loginForm().getByLabel("Username").fill(username);
  await loginForm().getByLabel("Password").fill("wrong-password");
  await loginForm().getByRole("button", { name: "Log in" }).click();
  await expect(loginForm().getByRole("alert")).toContainText("didn't match");
});

test("16. login then logout", async () => {
  await loginForm().getByLabel("Username").fill(username);
  await loginForm().getByLabel("Password").fill(password);
  await loginForm().getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/market$/);
  await expect(page.getByRole("heading", { level: 1, name: "Market" })).toBeVisible();
  await logOutInUi(page);
  await openMenuIfNeeded(page);
  await expect(mainNav(page).getByRole("link", { name: "Log in" })).toBeVisible();
  expect(await page.evaluate(() => fetch("/api/auth/me").then((r) => r.status))).toBe(401);
  await page.goto("/mylistings");
  await page.reload();
  await expect(loginForm()).toBeVisible();
});

test("17. layout: no horizontal scroll on key pages; the phone menu works", async () => {
  for (const path of ["/", "/about", "/login", "/register", "/market"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  const toggle = page.getByRole("button", { name: "Menu" });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
});

test("18. login: the rate limit shows 'Too many attempts'", async () => {
  await page.goto("/login");
  for (let attempt = 0; attempt < 11; attempt += 1) {
    await loginForm().getByLabel("Username").fill(username);
    await loginForm().getByLabel("Password").fill(`wrong-${attempt}-password`);
    const response = page.waitForResponse("**/api/auth/login");
    await loginForm().getByRole("button", { name: "Log in" }).click();
    if ((await response).status() === 429) {
      break;
    }
  }
  await expect(loginForm().getByRole("alert")).toContainText("Too many attempts");
});

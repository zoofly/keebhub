import {
  expect,
  expireSession,
  KASH,
  logOutInUi,
  mainNav,
  newUser,
  open,
  openMenuIfNeeded,
  SEED_PASSPHRASE,
  signIn,
  test,
} from "./fixtures";
import { uniqueName } from "./support";

// Q-F2: login/register UI, server messages, ?next= handling, logout.

// Obviously fake test-only value.
const NEW_PASSWORD = "correct horse battery";

test("register: short password is blocked client-side with the shared message", async ({
  page,
}) => {
  await open(page, "/register");
  const form = page.getByRole("form", { name: "Create an account" });
  let registerCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/auth/register")) registerCalls += 1;
  });
  await form.getByLabel("Username").fill("newperson");
  await form.getByLabel("Password").fill("short");
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(form.getByText("Password must be at least 8 characters")).toBeVisible();
  await expect(form.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByLabel("Password")).toBeFocused();
  expect(registerCalls).toBe(0);
});

test("register: a taken username (any case) shows the 409 message", async ({ page }) => {
  await open(page, "/register");
  const form = page.getByRole("form", { name: "Create an account" });
  await form.getByLabel("Username").fill("Bench");
  await form.getByLabel("Password").fill(NEW_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "That username is already taken. Try another one.",
  );
  await expect(form.getByRole("alert")).toBeFocused();
});

test("register: a new account is signed in and lands on the market", async ({ page }) => {
  await open(page, "/register");
  const form = page.getByRole("form", { name: "Create an account" });
  const username = uniqueName("fresh");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(NEW_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/market$/);
  await expect(page.getByText(`Welcome to Keebhub, ${username}!`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Market" })).toBeVisible();
  await openMenuIfNeeded(page);
  await expect(mainNav(page).getByRole("button", { name: "Log out" })).toBeVisible();
  // The password isn't left anywhere in the DOM.
  expect(await page.content()).not.toContain(NEW_PASSWORD);
});

test("login: wrong password message, then the rate-limit message with the wait", async ({
  page,
}) => {
  await open(page, "/login");
  const form = page.getByRole("form", { name: "Log in" });
  // An account of its own, so the lockout doesn't affect other tests.
  const username = uniqueName("lockme");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill("wrong password");
  await form.getByRole("button", { name: "Log in" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "That username and password didn't match. Please try again.",
  );
  await expect(form.getByLabel("Password")).toHaveValue("");

  for (let attempt = 2; attempt <= 11; attempt += 1) {
    await form.getByLabel("Password").fill(`wrong password ${attempt}`);
    const response = page.waitForResponse("**/api/auth/login");
    await form.getByRole("button", { name: "Log in" }).click();
    await response;
  }
  // The 11th attempt meets either the per-IP request limit (about a minute)
  // or the username lockout (about 15 minutes), whichever trips first.
  await expect(form.getByRole("alert")).toHaveText(
    /^Too many attempts in a short time\. Please wait about (a minute|1[45] minutes) and try again\.$/,
  );
});

test("login: a guest deep link to a protected page comes back after login", async ({ page }) => {
  await open(page, "/mylistings");
  await expect(page).toHaveURL(/\/login\?next=%2Fmylistings$/);
  const form = page.getByRole("form", { name: "Log in" });
  await form.getByLabel("Username").fill(KASH.username);
  await form.getByLabel("Password").fill(SEED_PASSPHRASE);
  await form.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/mylistings$/);
  await expect(page.getByRole("heading", { level: 1, name: "My listings" })).toBeVisible();
  expect(await page.content()).not.toContain(SEED_PASSPHRASE);
});

for (const next of ["//evil.com", "https://evil.com", "/\\evil.com"]) {
  test(`login: ?next=${next} is ignored (no open redirect)`, async ({ page }) => {
    await open(page, `/login?next=${encodeURIComponent(next)}`);
    const form = page.getByRole("form", { name: "Log in" });
    await form.getByLabel("Username").fill(KASH.username);
    await form.getByLabel("Password").fill(SEED_PASSPHRASE);
    await form.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/market$/);
  });
}

test("logout clears the session; protected pages then redirect to login", async ({ page }) => {
  await signIn(page, KASH.username, "/mylistings");
  await expect(page.getByTestId("listing-card").first()).toBeVisible();
  await logOutInUi(page);
  await expect(page.getByText("You've logged out.")).toBeVisible();
  await openMenuIfNeeded(page);
  await expect(mainNav(page).getByRole("link", { name: "Log in" })).toBeVisible();
  const me = await page.evaluate(() => fetch("/api/auth/me").then((r) => r.status));
  expect(me).toBe(401);
  await page.goto("/mylistings");
  await expect(page).toHaveURL(/\/login\?next=%2Fmylistings$/);
});

test("an expired session drops to login without a request loop", async ({ page }) => {
  await signIn(page, KASH.username, "/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Hi, kash!" })).toBeVisible();
  await expireSession(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(request.url());
  });
  await openMenuIfNeeded(page);
  await mainNav(page).getByRole("link", { name: "My listings" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fmylistings$/);
  await expect(page.getByRole("form", { name: "Log in" })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(requests.length, requests.join(", ")).toBeLessThan(6);
});

test("profile: change password, wrong current password is a field error", async ({ page }) => {
  // Its own account: the seeded ones keep their password for other tests.
  await newUser(page, "pwchange", "/profile");
  const section = page.getByRole("region", { name: "Change password" });
  await section.getByLabel("Current password").fill("not my password");
  await section.getByLabel(/^New password/).fill(NEW_PASSWORD);
  await section.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await section.getByRole("button", { name: "Change password" }).click();
  await expect(section.getByText("That isn't your current password")).toBeVisible();
  await expect(page).toHaveURL(/\/profile$/);

  await section.getByLabel("Current password").fill(SEED_PASSPHRASE);
  await section.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();
});

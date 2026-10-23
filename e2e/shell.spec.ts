import {
  expect,
  expectAccessible,
  expectNoHorizontalScroll,
  mainNav,
  open,
  openMenuIfNeeded,
  test,
} from "./fixtures";

// Q-F1: app shell, keyboard navigation, focus management, CSP, 404.

test("home, about and 404 have no serious axe violations", async ({ page }) => {
  for (const path of ["/", "/about", "/no-such-page"]) {
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  await expect(page).toHaveTitle("Page not found · Keebhub");
});

test("the skip link is the first Tab stop and moves focus to main", async ({ page }) => {
  await open(page, "/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  // The next Tab lands inside the page content, not back in the header.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("main") !== null)).toBe(true);
});

test("the nav links can be reached and used with the keyboard alone", async ({ page }) => {
  await open(page, "/");
  await openMenuIfNeeded(page);
  const names = await mainNav(page).getByRole("link").allTextContents();
  expect(names).toEqual(["Home", "Market", "About", "Log in", "Sign up"]);

  // Tab through the header until "About", then activate it with Enter.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (focused === "About") {
      break;
    }
  }
  await expect(mainNav(page).getByRole("link", { name: "About" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1, name: "About Keebhub" })).toBeVisible();
  // Route changes move focus to <main>.
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page).toHaveTitle("About · Keebhub");
});

test("the phone menu opens, closes with Escape, and closes after navigating", async ({ page }) => {
  const toggle = page.getByRole("button", { name: "Menu" });
  await open(page, "/");
  if (!(await toggle.isVisible())) {
    test.skip(true, "desktop layout has no menu button");
  }
  await expect(mainNav(page)).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(mainNav(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await mainNav(page).getByRole("link", { name: "Market" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Market" })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("old hash-router paths redirect", async ({ page }) => {
  await open(page, "/registration");
  await expect(page).toHaveURL(/\/register$/);
  await open(page, "/home");
  await expect(page).toHaveURL(/\/$/);
});

test("a page that throws shows the error page inside the layout", async ({ page }) => {
  await open(page, "/market/abc");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(mainNav(page).or(page.getByRole("button", { name: "Menu" }))).toBeVisible();
});

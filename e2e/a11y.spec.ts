import { appendFileSync } from "node:fs";
import {
  type AxeSummary,
  expect,
  expectAccessible,
  expectNoHorizontalScroll,
  open,
  signIn,
  test,
} from "./fixtures";

// Q-F4 "axe on all pages", at both widths (the desktop and mobile projects).
// Set AXE_REPORT=<file> to append a JSON line per page with the counts.

const guestPages: [string, string][] = [
  ["/", "Welcome to Keebhub"],
  ["/about", "About Keebhub"],
  ["/market", "Market"],
  ["/market/2", "Tofu65 aluminum case (E-white)"],
  ["/login", "Log in"],
  ["/register", "Create an account"],
  ["/nope", "Page not found"],
];

const memberPages: [string, string][] = [
  ["/", "Welcome back, kash!"],
  ["/market", "Market"],
  ["/market/6", "NovelKeys Cream x70"],
  ["/create", "Create a listing"],
  ["/market/6/edit", "Edit listing"],
  ["/mylistings", "My listings"],
  ["/saved", "Saved listings"],
  ["/profile", "Hi, kash!"],
];

function record(project: string, path: string, who: string, summary: AxeSummary) {
  const file = process.env.AXE_REPORT;
  if (file) {
    appendFileSync(file, `${JSON.stringify({ project, who, path, ...summary })}\n`);
  }
}

test("guest pages: zero serious/critical axe violations, no sideways scroll", async ({
  page,
}, info) => {
  for (const [path, heading] of guestPages) {
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    // Let lists and images settle so axe sees the real page.
    await page.waitForLoadState("networkidle");
    record(info.project.name, path, "guest", await expectAccessible(page));
    await expectNoHorizontalScroll(page);
  }
});

test("signed-in pages: zero serious/critical axe violations, no sideways scroll", async ({
  page,
}, info) => {
  await signIn(page);
  for (const [path, heading] of memberPages) {
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await page.waitForLoadState("networkidle");
    record(info.project.name, path, "kash", await expectAccessible(page));
    await expectNoHorizontalScroll(page);
  }
});

test("open dialogs and menus are accessible too", async ({ page }) => {
  await signIn(page, "kash", "/mylistings");
  await page
    .getByRole("button", { name: /^Delete /i })
    .first()
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeHidden();

  const toggle = page.getByRole("button", { name: "Menu" });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expectAccessible(page);
  }
});

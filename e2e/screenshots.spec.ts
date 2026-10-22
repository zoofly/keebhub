import { join } from "node:path";
import { expect, open, signIn, test } from "./fixtures";

// Full-page screenshots of every page at both widths, for review. Only runs
// when SHOTS_DIR is set: SHOTS_DIR=/tmp/shots npm run e2e -- screenshots
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to take screenshots");

const shot = async (page: import("@playwright/test").Page, project: string, name: string) => {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: join(dir ?? ".", `${project}-${name}.png`), fullPage: true });
};

test("guest pages", async ({ page }, info) => {
  for (const [path, name] of [
    ["/", "home"],
    ["/about", "about"],
    ["/market", "market"],
    ["/market/2", "listing"],
    ["/login", "login"],
    ["/register", "register"],
    ["/nope", "not-found"],
  ] as const) {
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, info.project.name, `guest-${name}`);
  }
  await open(page, "/register");
  await page.getByRole("button", { name: "Create account" }).click();
  await shot(page, info.project.name, "guest-register-errors");
});

test("signed-in pages", async ({ page }, info) => {
  await signIn(page);
  for (const [path, name] of [
    ["/", "home"],
    ["/market", "market"],
    ["/market/6", "listing-own"],
    ["/create", "create"],
    ["/market/6/edit", "edit"],
    ["/mylistings", "mylistings"],
    ["/saved", "saved"],
    ["/profile", "profile"],
  ] as const) {
    await open(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, info.project.name, `member-${name}`);
  }
  await open(page, "/mylistings");
  await page
    .getByRole("button", { name: /^Delete/ })
    .first()
    .click();
  await page.screenshot({
    path: join(dir ?? ".", `${info.project.name}-member-delete-dialog.png`),
  });
  await page.keyboard.press("Escape");
  const toggle = page.getByRole("button", { name: "Menu" });
  if (await toggle.isVisible()) {
    await toggle.click();
    await page.screenshot({ path: join(dir ?? ".", `${info.project.name}-member-menu-open.png`) });
  }
});

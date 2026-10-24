import type { Browser, Page } from "@playwright/test";
import {
  expect,
  mainNav,
  openMenuIfNeeded,
  prepareContext,
  SEED_PASSPHRASE,
  test,
  watchConsole,
} from "./fixtures";
import { uniqueName } from "./support";

// Q-C: the full journey against the real API, at both widths. Two users in
// two browser contexts: A lists something, B can't touch it (UI and API).

const PASSWORD = SEED_PASSPHRASE;
const cards = (page: Page) => page.getByTestId("listing-card");

async function newPage(
  browser: Browser,
  baseURL: string | undefined,
  viewport: { width: number; height: number } | null,
) {
  const context = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    ...(viewport ? { viewport } : {}),
  });
  await prepareContext(context);
  const page = await context.newPage();
  return { context, page, issues: watchConsole(page) };
}

async function registerInUi(page: Page, username: string) {
  await page.goto("/register");
  const form = page.getByRole("form", { name: "Create an account" });
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/market$/);
}

async function logOutInUi(page: Page) {
  await openMenuIfNeeded(page);
  await mainNav(page).getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function logInInUi(page: Page, username: string) {
  await page.goto("/login");
  const form = page.getByRole("form", { name: "Log in" });
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(PASSWORD);
  await form.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/market$/);
}

test("register, log out, log in; list, edit, save; another user can't touch it; delete; log out", async ({
  browser,
}, info) => {
  const { baseURL, viewport } = info.project.use;
  const a = await newPage(browser, baseURL, viewport ?? null);
  const b = await newPage(browser, baseURL, viewport ?? null);
  const nameA = uniqueName("sellera");
  const nameB = uniqueName("buyerb");
  const title = `Journey board ${nameA}`;

  // A: register, log out, log in again.
  await registerInUi(a.page, nameA);
  await logOutInUi(a.page);
  await logInInUi(a.page, nameA);

  // A: create a listing.
  await a.page.goto("/create");
  await a.page.getByLabel("Title").fill(title);
  await a.page.getByLabel("Photo URL").fill("https://img.keebhub.test/journey.svg");
  await a.page.getByLabel("Price (USD)").fill("250");
  await a.page.getByLabel("Description").fill("Built for the journey test.");
  await a.page.getByRole("button", { name: "Post listing" }).click();
  await expect(a.page.getByText("Listing posted!")).toBeVisible();
  await expect(a.page).toHaveURL(/\/market\/\d+$/);
  const listingUrl = new URL(a.page.url()).pathname;
  const id = Number(listingUrl.split("/").pop());

  // A: edit it.
  await a.page.goto(`${listingUrl}/edit`);
  await a.page.getByLabel("Price (USD)").fill("199.99");
  await a.page.getByRole("button", { name: "Save changes" }).click();
  await expect(a.page.getByText("Listing updated")).toBeVisible();
  await expect(a.page.getByText("$199.99")).toBeVisible();

  // A: a deep-link reload of /mylistings keeps the session.
  await a.page.goto("/mylistings");
  await a.page.reload();
  await expect(a.page.getByRole("heading", { level: 1, name: "My listings" })).toBeVisible();
  await expect(cards(a.page).filter({ hasText: title })).toHaveCount(1);

  // B: register, sees A's listing without owner controls, can't edit it.
  await registerInUi(b.page, nameB);
  await b.page.goto(listingUrl);
  await expect(b.page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(b.page.getByText(`Sold by ${nameA}`)).toBeVisible();
  await expect(b.page.getByRole("link", { name: /^Edit/ })).toHaveCount(0);
  await expect(b.page.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  await b.page.goto(`${listingUrl}/edit`);
  await expect(
    b.page.getByRole("heading", { level: 1, name: "Can't edit this listing" }),
  ).toBeVisible();

  // B: the API agrees: PUT and DELETE on A's posting are 404s.
  const origin = new URL(b.page.url()).origin;
  const put = await b.page.request.put(`/api/postings/${id}`, {
    headers: { origin },
    data: { title: "mine now", imageUrl: "https://img.keebhub.test/x.svg", priceCents: 1 },
  });
  expect(put.status()).toBe(404);
  const del = await b.page.request.delete(`/api/postings/${id}`, { headers: { origin } });
  expect(del.status()).toBe(404);
  await a.page.goto(listingUrl);
  await expect(a.page.getByRole("heading", { level: 1 })).toHaveText(title);

  // B: save, see it on Saved, unsave.
  await b.page.goto(listingUrl);
  const save = b.page.getByRole("button", { name: `Save ${title}` });
  await save.click();
  await expect(b.page.getByRole("button", { name: `Saved ${title}` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await b.page.goto("/saved");
  await expect(cards(b.page).filter({ hasText: title })).toHaveCount(1);
  await b.page.reload();
  await expect(b.page.getByRole("button", { name: `Saved ${title}` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await b.page.getByRole("button", { name: `Saved ${title}` }).click();
  await expect(cards(b.page).filter({ hasText: title })).toHaveCount(0);

  // A: delete it (B had it saved; that row goes too).
  await a.page.goto("/mylistings");
  await cards(a.page)
    .filter({ hasText: title })
    .getByRole("button", { name: /^Delete/ })
    .click();
  await a.page.getByRole("alertdialog").getByRole("button", { name: "Delete listing" }).click();
  await expect(a.page.getByText("Listing deleted")).toBeVisible();
  expect((await a.page.request.get(`/api/postings/${id}`)).status()).toBe(404);

  // A: log out; every protected page now asks to log in.
  await logOutInUi(a.page);
  for (const path of ["/mylistings", "/saved", "/create", "/profile", `/market/${id}/edit`]) {
    await a.page.goto(path);
    await expect(a.page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
  }
  expect((await a.page.request.get("/api/auth/me")).status()).toBe(401);

  expect(a.issues, "console errors / CSP reports (A)").toEqual([]);
  expect(b.issues, "console errors / CSP reports (B)").toEqual([]);
  await a.context.close();
  await b.context.close();
});

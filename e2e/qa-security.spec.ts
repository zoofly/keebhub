import { createListing, expect, KASH, logOutInUi, newUser, open, signIn, test } from "./fixtures";
import { SEED_PASSPHRASE } from "./support";

// QA: browser-side security checks against the real Worker: stored XSS in
// every user-controlled field renders inertly under the enforced CSP, ?next=
// can't redirect off-site, the __Host- session cookie as the browser stores
// it, and a session's data doesn't outlive logout.

const PAYLOADS = {
  title: `<img src=x onerror="window.__xss='title'">"><script>window.__xss='title2'</script>`,
  description: `<svg onload="window.__xss='desc'"></svg><a href="javascript:window.__xss='link'">click</a>{{constructor.constructor('window.__xss=1')()}}`,
  // A real https URL whose path carries markup: it must stay an attribute value.
  imageUrl: `https://img.keebhub.test/x"><img src=x onerror="window.__xss='img'">.svg`,
};

async function expectInert(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => (window as { __xss?: unknown }).__xss)).toBeUndefined();
  expect(
    await page.locator('img[src="x"], script:not([src]), svg[onload], [onerror], [onload]').count(),
  ).toBe(0);
  expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
}

test("stored XSS payloads in every listing field render as text on every page", async ({
  page,
}) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await newUser(page, "xss");
  const listing = await createListing(page, { ...PAYLOADS, priceCents: 4200 });

  for (const path of ["/market", `/market/${listing.id}`, "/mylistings"]) {
    await open(page, path);
    await expect(page.getByText(PAYLOADS.title).first()).toBeVisible();
    await expectInert(page);
  }

  // Detail page: the description shows verbatim, the title is the page title.
  await open(page, `/market/${listing.id}`);
  await expect(page.getByText(PAYLOADS.description)).toBeVisible();
  await expect(page).toHaveTitle(`${PAYLOADS.title} · Keebhub`);
  const img = page.getByRole("img", { name: PAYLOADS.title });
  await expect(img).toHaveAttribute("src", PAYLOADS.imageUrl);

  // Save it (owners have no Save button, so through the API) for the Saved page.
  const saved = await page.request.put(`/api/me/saved/${listing.id}`, {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(saved.status()).toBe(201);
  await open(page, "/saved");
  await expect(page.getByText(PAYLOADS.title).first()).toBeVisible();
  await expectInert(page);

  // The edit form puts the raw text back in the inputs, unchanged.
  await open(page, `/market/${listing.id}/edit`);
  await expect(page.getByLabel("Title")).toHaveValue(PAYLOADS.title);
  await expect(page.getByLabel("Description")).toHaveValue(PAYLOADS.description);
  await expect(page.getByLabel("Photo URL")).toHaveValue(PAYLOADS.imageUrl);
  await expectInert(page);

  // Delete it (and its toast) without anything running.
  await open(page, `/market/${listing.id}`);
  await page.getByRole("button", { name: /^Delete/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete listing" }).click();
  await expect(page.getByText("Listing deleted")).toBeVisible();
  await expectInert(page);
  expect(dialogs).toEqual([]);
});

for (const next of ["/.//evil.example", "/..//evil.example/market", "/%2e//evil.example"]) {
  test(`?next=${next} can't send a signed-in user or a new login off-site`, async ({ page }) => {
    let leaked = false;
    await page.route(
      (url) => url.hostname === "evil.example",
      (route) => {
        leaked = true;
        return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>evil</h1>" });
      },
    );
    const origin = "http://localhost:4173";

    // A guest logs in from a link with a hostile ?next=.
    await open(page, `/login?next=${encodeURIComponent(next)}`);
    const form = page.getByRole("form", { name: "Log in" });
    await form.getByLabel("Username").fill(KASH.username);
    await form.getByLabel("Password").fill(SEED_PASSPHRASE);
    await form.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(`${origin}/market`);

    // Already signed in: /login redirects straight to ?next=, which must stay here.
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await expect(page).toHaveURL(`${origin}/market`);
    await expect(page.getByRole("heading", { level: 1, name: "Market" })).toBeVisible();
    expect(leaked).toBe(false);
  });
}

test("the browser stores the session as a host-only, Secure, HttpOnly, Lax __Host- cookie", async ({
  page,
  context,
}) => {
  await signIn(page, KASH.username, "/");
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "__Host-keebhub_session");
  expect(session, JSON.stringify(cookies)).toBeDefined();
  expect(session).toMatchObject({
    domain: "localhost",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  });
  // Seven days, give or take the test's own runtime.
  const days = ((session?.expires ?? 0) - Date.now() / 1000) / 86_400;
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThanOrEqual(7);
  // Scripts can't read it.
  expect(await page.evaluate(() => document.cookie)).not.toContain("keebhub_session");
  // It's the only cookie the app sets.
  expect(cookies.map((c) => c.name)).toEqual(["__Host-keebhub_session"]);

  await logOutInUi(page);
  await expect(page.getByText("You've logged out.")).toBeVisible();
  expect(
    (await context.cookies()).find((c) => c.name === "__Host-keebhub_session"),
  ).toBeUndefined();
});

test("after logout, Back doesn't show the previous user's pages from cache", async ({ page }) => {
  await signIn(page, KASH.username, "/mylistings");
  await expect(page.getByTestId("listing-card").first()).toBeVisible();
  await logOutInUi(page);
  await expect(page.getByText("You've logged out.")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/login\?next=%2Fmylistings$/);
  await expect(page.getByTestId("listing-card")).toHaveCount(0);
});

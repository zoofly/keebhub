import {
  createListing,
  expect,
  expectNoHorizontalScroll,
  failNext,
  KASH,
  newUser,
  open,
  signIn,
  test,
} from "./fixtures";

// Q-F3: postings list, cards, create/edit/delete, owner-only controls.

const cards = (page: import("@playwright/test").Page) => page.getByTestId("listing-card");

test("guests can browse the market and a listing, with Load more", async ({ page }) => {
  await open(page, "/market");
  await expect(cards(page)).toHaveCount(12);
  const prices = await page.getByTestId("listing-price").allTextContents();
  for (const price of prices) {
    expect(price).toMatch(/^\$[\d,]+\.\d\d$|^Free \/ trade$/);
  }
  await expect(page.getByRole("link", { name: /^Edit /i })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Load more listings" }).click();
  await expect(cards(page)).toHaveCount(24);
  await expect(cards(page).nth(12).getByRole("heading").getByRole("link")).toBeFocused();
  await page.getByRole("button", { name: "Load more listings" }).click();
  await expect(cards(page)).toHaveCount(25);
  await expect(page.getByText("You've reached the end.")).toBeVisible();

  await cards(page).first().getByRole("heading").getByRole("link").click();
  await expect(page).toHaveURL(/\/market\/25$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Long description test board");
  await expect(page.getByRole("link", { name: /log in to save/i })).toHaveAttribute(
    "href",
    "/login?next=%2Fmarket%2F25",
  );
});

test("listing images: no Referer, lazy, and broken links show the placeholder", async ({
  page,
}) => {
  await open(page, "/market");
  const working = cards(page).first().getByRole("img").first();
  await expect(working).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(working).toHaveAttribute("loading", "lazy");
  await expect
    .poll(() => working.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // Every fourth seeded posting has a broken image link (id 24 is on page one).
  const broken = cards(page).filter({ hasText: "Krytox 205g0, 5ml jar" });
  await broken.scrollIntoViewIfNeeded();
  await expect(broken.getByRole("img", { name: /no photo available/i })).toBeVisible();
});

test("create: javascript: and http: images are rejected before sending", async ({ page }) => {
  await signIn(page, KASH.username, "/create");
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/postings")) posts += 1;
  });
  await page.getByLabel("Title").fill("E2E <b>board</b>");
  await page.getByLabel("Photo URL").fill("javascript:alert(1)");
  await page.getByLabel("Price (USD)").fill("12.5");
  await page.getByRole("button", { name: "Post listing" }).click();
  await expect(page.getByText("Image URL must be an https:// link")).toBeVisible();
  await page.getByLabel("Photo URL").fill("http://example.com/e2e.jpg");
  await page.getByRole("button", { name: "Post listing" }).click();
  await expect(page.getByText("Image URL must be an https:// link")).toBeVisible();
  await page.getByLabel("Price (USD)").fill("0x10");
  await page.getByRole("button", { name: "Post listing" }).click();
  await expect(page.getByText("Enter a price like 199.99 (0 to 99,999,999.99)")).toBeVisible();
  expect(posts).toBe(0);
  await expectNoHorizontalScroll(page);
});

test("create, edit and delete a listing; the lists stay in sync", async ({ page }) => {
  page.on("dialog", (dialog) => {
    throw new Error(`unexpected native dialog: ${dialog.message()}`);
  });
  await signIn(page, KASH.username, "/create");
  await page.getByLabel("Title").fill("E2E <b>board</b>");
  await page.getByLabel("Photo URL").fill("https://img.keebhub.test/e2e.svg");
  await expect(page.getByRole("img", { name: "Preview of your listing" })).toBeVisible();
  await page.getByLabel("Price (USD)").fill("12.5");
  await page.getByLabel("Description").fill("<img src=x onerror=alert(1)> desc");
  await page.getByRole("button", { name: "Post listing" }).click();

  await expect(page.getByText("Listing posted!")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E <b>board</b>");
  await expect(page.getByText("$12.50")).toBeVisible();
  await expect(page.getByText("<img src=x onerror=alert(1)> desc")).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);

  // Newest first on the market, with owner controls.
  await page.goto("/market");
  const first = cards(page).first();
  await expect(first).toContainText("E2E <b>board</b>");
  await expect(first.getByRole("link", { name: "Edit E2E <b>board</b>" })).toBeVisible();

  // Edit: price pre-fills as dollars.
  await first.getByRole("link", { name: /^Edit/ }).click();
  await expect(page.getByLabel("Price (USD)")).toHaveValue("12.50");
  await page.getByLabel("Title").fill("E2E board edited");
  await page.getByLabel("Price (USD)").fill("15");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Listing updated")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E board edited");
  await expect(page.getByText("$15.00")).toBeVisible();

  // Deep-link reload keeps the session.
  await page.goto("/mylistings");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "My listings" })).toBeVisible();
  const mine = cards(page).filter({ hasText: "E2E board edited" });
  await expect(mine).toHaveCount(1);

  // Delete with the confirm dialog (Escape cancels first).
  await mine.getByRole("button", { name: /^Delete/ }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this listing?" });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(mine.getByRole("button", { name: /^Delete/ })).toBeFocused();
  await mine.getByRole("button", { name: /^Delete/ }).click();
  await dialog.getByRole("button", { name: "Delete listing" }).click();
  await expect(page.getByText("Listing deleted")).toBeVisible();
  await expect(mine).toHaveCount(0);
  // Focus moved to the page heading, not <body> (the button is gone).
  await expect
    .poll(() =>
      page.evaluate(
        () => `${document.activeElement?.tagName}:${document.activeElement?.textContent}`,
      ),
    )
    .toBe("H1:My listings");
});

test("deleting from the market grid moves focus to the heading and announces it", async ({
  page,
}) => {
  await newUser(page, "delfocus");
  const listing = await createListing(page, { title: "Focus test board" });
  await open(page, "/market");
  const card = cards(page).filter({ hasText: listing.title });
  await card.getByRole("button", { name: `Delete ${listing.title}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete listing" }).click();
  await expect(card).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => `${document.activeElement?.tagName}:${document.activeElement?.textContent}`,
      ),
    )
    .toBe("H1:Market");
  const inPoliteRegion = await page
    .getByText("Listing deleted")
    .evaluate((element) => element.closest('[aria-live="polite"]') !== null);
  expect(inPoliteRegion).toBe(true);
});

test("someone else's listing has no owner controls and can't be edited by URL", async ({
  page,
}) => {
  await signIn(page, KASH.username, "/market/2");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tofu65 aluminum case (E-white)",
  );
  await expect(page.getByRole("link", { name: /^Edit/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  await page.goto("/market/2/edit");
  await expect(
    page.getByRole("heading", { level: 1, name: "Can't edit this listing" }),
  ).toBeVisible();
  // The API agrees: PUT on someone else's posting is a 404.
  const status = await page.evaluate(() =>
    fetch("/api/postings/2", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "mine now",
        imageUrl: "https://img.keebhub.test/x.svg",
        priceCents: 1,
      }),
    }).then((r) => r.status),
  );
  expect(status).toBe(404);
});

test("a market load failure shows an error with a working retry", async ({ page }) => {
  await failNext(page, "GET", "/api/postings", 2);
  await open(page, "/market");
  const alert = page.getByRole("alert").filter({ hasText: "The listings didn't load" });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(cards(page)).toHaveCount(12);
});

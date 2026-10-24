import { expect, failNext, KASH, open, signIn, test } from "./fixtures";

// Q-F4: saved listings, switch guide states.

test("save and unsave toggles are idempotent and the Saved page follows", async ({ page }) => {
  await signIn(page, KASH.username, "/saved");
  // kash has one saved listing in the seed.
  await expect(page.getByTestId("listing-card")).toHaveCount(1);
  await expect(page.getByTestId("listing-card")).toContainText("Tofu65 aluminum case (E-white)");

  await page.goto("/market");
  const card = page.getByTestId("listing-card").filter({ hasText: "Brass weight for Tofu65" });
  const toggle = card.getByRole("button", { name: /^Save/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAccessibleName("Saved Brass weight for Tofu65");
  // Double-click (save is already on: unsave then save): ends saved, no errors.
  await toggle.dblclick();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.waitForLoadState("networkidle");

  await page.goto("/saved");
  await expect(page.getByTestId("listing-card")).toHaveCount(2);
  // Unsave from the Saved page; it drops off the list.
  await page
    .getByTestId("listing-card")
    .filter({ hasText: "Brass weight for Tofu65" })
    .getByRole("button", { name: /^Saved/ })
    .click();
  await expect(page.getByTestId("listing-card")).toHaveCount(1);
  await expect(page.getByText(/couldn't/i)).toHaveCount(0);
});

test("guests are asked to log in to save, and come back to the page", async ({ page }) => {
  await open(page, "/market/2");
  await page.getByRole("link", { name: /log in to save/i }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fmarket%2F2$/);
});

test("switch guide: filter by type, error and retry", async ({ page }) => {
  await open(page, "/");
  const guide = page.getByRole("region", { name: "Switch guide" });
  await expect(guide.getByRole("article")).toHaveCount(20);
  await guide.getByRole("button", { name: "Tactile" }).click();
  await expect(guide.getByRole("button", { name: "Tactile" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(guide.getByRole("article")).toHaveCount(7);

  await failNext(page, "GET", "/api/switches", 2);
  await page.reload();
  const alert = guide.getByRole("alert");
  await expect(alert).toContainText("Switches didn't load");
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(guide.getByRole("article")).toHaveCount(20);
});

// QA: client-side guarantees from the plan's amendments: all cached data is
// dropped when a session ends (logout, account delete, 401), and listing
// images only ever render https URLs.
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListingImage } from "./components/ListingImage";
import { db } from "./mocks/db";
import { MOCK_PASSPHRASE } from "./mocks/fixtures";
import { installFakeTurnstile, renderApp, signInAs } from "./test/render";

/** Every cached query key that belongs to a signed-in user. */
const userKeys = (keys: readonly unknown[][]) =>
  keys.filter((key) => key[0] === "me" && key.length > 1).map((key) => JSON.stringify(key));

describe("session end clears the query cache", () => {
  it("account deletion leaves nothing of the user's data in the cache", async () => {
    signInAs(1);
    const { user, router, queryClient } = renderApp("/saved");
    await screen.findByRole("heading", { level: 1, name: "Saved listings" });
    await screen.findAllByTestId("listing-card");
    await user.click(
      within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", {
        name: "Profile",
      }),
    );
    const section = await screen.findByRole("region", { name: "Delete account" });
    expect(
      userKeys(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => [...q.queryKey]),
      ),
    ).not.toEqual([]);

    await user.click(within(section).getByRole("button", { name: "Delete my account" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete your account?" });
    await user.type(within(dialog).getByLabelText(/password/i), MOCK_PASSPHRASE);
    await user.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));

    const cached = queryClient
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.data !== undefined)
      .map((q) => [...q.queryKey]);
    expect(userKeys(cached)).toEqual([]);
    expect(queryClient.getQueryData(["me"])).toBeNull();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("the next person to sign in on the same tab sees none of the previous user's saved state", async () => {
    signInAs(1);
    installFakeTurnstile();
    const { user, router, queryClient } = renderApp("/saved");
    await screen.findAllByTestId("listing-card");
    const kashSaved = queryClient.getQueryData<Set<number>>(["me", "saved", "ids"]);
    expect(kashSaved?.size).toBeGreaterThan(0);

    const nav = screen.getByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));

    // bench has saved a different listing than kash.
    db.state.saved.push({ userId: 2, postingId: 5, savedAt: "2026-10-02T12:00:00.000Z" });
    await router.navigate("/login?next=%2Fsaved");
    const form = await screen.findByRole("form", { name: "Log in" });
    await user.type(within(form).getByLabelText(/username/i), "bench");
    await user.type(within(form).getByLabelText(/password/i), MOCK_PASSPHRASE);
    await user.click(within(form).getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/saved"));
    await screen.findByRole("heading", { level: 1, name: "Saved listings" });

    await waitFor(() =>
      expect(queryClient.getQueryData<Set<number>>(["me", "saved", "ids"])).toEqual(new Set([5])),
    );
    const cards = await screen.findAllByTestId("listing-card");
    expect(cards).toHaveLength(1);
    expect(
      within(cards[0] as HTMLElement).getByRole("button", { pressed: true }),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(["me"])).toEqual({ id: 2, username: "bench" });
  });
});

describe("ListingImage", () => {
  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "http://img.example.com/a.jpg",
    "//img.example.com/a.jpg",
    "https:img.example.com/a.jpg",
    "",
  ])("renders a placeholder, not an <img>, for %j", (src) => {
    const { container } = render(<ListingImage src={src} alt="Board" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "No photo available for Board" })).toBeInTheDocument();
  });

  it("renders https images lazily with no Referer", () => {
    const { container } = render(<ListingImage src="https://img.example.com/a.jpg" alt="Board" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://img.example.com/a.jpg");
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });
});

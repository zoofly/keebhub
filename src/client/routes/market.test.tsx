import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { db } from "../mocks/db";
import { renderApp, signInAs } from "../test/render";

const cards = () => screen.getAllByTestId("listing-card");
const cardFor = (title: string) => {
  const card = cards().find((element) => within(element).queryByRole("heading", { name: title }));
  if (!card) {
    throw new Error(`No card for ${title}`);
  }
  return card;
};

describe("Market (logged out)", () => {
  it("lists postings newest first with prices and Load more", async () => {
    const { user } = renderApp("/market");
    await waitFor(() => expect(cards()).toHaveLength(12));
    expect(within(cards()[0] as HTMLElement).getByRole("heading")).toHaveTextContent(
      "Long description test board",
    );
    expect(
      within(cardFor("Brass weight for Tofu65")).getByTestId("listing-price"),
    ).toHaveTextContent("$50.00");

    await user.click(screen.getByRole("button", { name: "Load more listings" }));
    await waitFor(() => expect(cards()).toHaveLength(24));
    // Focus moves to the first newly loaded listing.
    const firstNew = within(within(cards()[12] as HTMLElement).getByRole("heading")).getByRole(
      "link",
    );
    expect(firstNew).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Load more listings" }));
    await waitFor(() => expect(cards()).toHaveLength(25));
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
    expect(screen.getByText("You've reached the end.")).toBeInTheDocument();
    expect(within(cardFor("Gateron Oil Kings x90")).getByTestId("listing-price")).toHaveTextContent(
      "Free / trade",
    );
  });

  it("offers guests 'Log in to save' instead of Save, and no owner controls", async () => {
    renderApp("/market");
    await waitFor(() => expect(cards()).toHaveLength(12));
    const card = cards()[0] as HTMLElement;
    const loginToSave = within(card).getByRole("link", { name: /log in to save/i });
    expect(loginToSave).toHaveAttribute("href", "/login?next=%2Fmarket");
    expect(screen.queryByRole("link", { name: /^edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^delete/i })).toBeNull();
  });

  it("shows the placeholder when an image fails to load", async () => {
    renderApp("/market");
    await waitFor(() => expect(cards()).toHaveLength(12));
    const card = cardFor("Hot-swap PCB for 65% (south-facing)");
    const img = within(card).getByRole("img", { name: "Hot-swap PCB for 65% (south-facing)" });
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("loading", "lazy");
    fireEvent.error(img);
    expect(
      within(card).getByRole("img", { name: /no photo available for hot-swap pcb/i }),
    ).toBeInTheDocument();
  });

  it("renders stored HTML as text", async () => {
    db.state.postings.push({
      id: 500,
      userId: 2,
      title: '<img src=x onerror="alert(1)">',
      description: "<b>bold?</b>",
      imageUrl: "https://img.keebhub.test/x.svg",
      priceCents: 100,
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
    });
    renderApp("/market");
    expect(
      await screen.findByRole("heading", { name: '<img src=x onerror="alert(1)">' }),
    ).toBeVisible();
    expect(screen.getByText("<b>bold?</b>")).toBeVisible();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});

describe("Market (signed in)", () => {
  it("shows Edit and Delete only on the owner's listings", async () => {
    signInAs(1); // kash owns postings 6, 12, 18, 24
    renderApp("/market");
    await waitFor(() => expect(cards()).toHaveLength(12));
    for (const card of cards()) {
      const own = within(card).queryByText("Your listing") !== null;
      expect(within(card).queryByRole("link", { name: /^edit/i }) !== null).toBe(own);
      expect(within(card).queryByRole("button", { name: /^delete/i }) !== null).toBe(own);
      expect(within(card).queryByRole("button", { name: /^save/i }) !== null).toBe(!own);
    }
    expect(within(cardFor("Brass weight for Tofu65")).queryByText("Your listing")).toBeNull();
    expect(
      within(cardFor("Hot-swap PCB for 65% (south-facing)")).getByText("Your listing"),
    ).toBeVisible();
  });

  it("save toggles are idempotent: double clicks and stale state end consistent", async () => {
    signInAs(1);
    const { user } = renderApp("/market");
    await waitFor(() => expect(cards()).toHaveLength(12));
    const card = cardFor("Brass weight for Tofu65");
    const toggle = await within(card).findByRole("button", { name: /save brass weight/i });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
    expect(toggle).toHaveAccessibleName(/saved brass weight/i);
    await waitFor(() =>
      expect(db.state.saved.filter((row) => row.userId === 1 && row.postingId === 23)).toHaveLength(
        1,
      ),
    );

    // Someone else's tab already unsaved it: DELETE gets a 404, which is fine.
    db.state.saved = db.state.saved.filter((row) => row.postingId !== 23);
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
    expect(screen.queryByText(/couldn't/i)).toBeNull();

    // Two quick clicks: save, then unsave.
    await user.dblClick(toggle);
    await waitFor(() =>
      expect(db.state.saved.some((row) => row.userId === 1 && row.postingId === 23)).toBe(false),
    );
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
  });

  it("deletes with a confirm dialog and refreshes the list", async () => {
    signInAs(1);
    const { user } = renderApp("/mylistings");
    await waitFor(() => expect(cards()).toHaveLength(4));
    const card = cardFor("Hot-swap PCB for 65% (south-facing)");
    await user.click(within(card).getByRole("button", { name: /delete hot-swap/i }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this listing?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Delete listing" }));
    await waitFor(() => expect(cards()).toHaveLength(3));
    // The Delete button is gone with its card: focus lands on the page heading
    // (not <body>) and the result is announced politely.
    expect(screen.getByRole("heading", { level: 1, name: "My listings" })).toHaveFocus();
    const announcement = await screen.findByText("Listing deleted");
    expect(announcement.closest('[aria-live="polite"]')).not.toBeNull();
    expect(db.state.postings.some((posting) => posting.id === 18)).toBe(false);
  });

  it("cancelling returns focus to the Delete button that opened the dialog", async () => {
    signInAs(1);
    const { user } = renderApp("/mylistings");
    await waitFor(() => expect(cards()).toHaveLength(4));
    const button = within(cards()[0] as HTMLElement).getByRole("button", { name: /^delete/i });
    await user.click(button);
    // (jsdom doesn't fire <dialog> cancel on Escape; e2e covers Escape.)
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(button).toHaveFocus();
  });

  it("cancelling the delete dialog keeps the listing", async () => {
    signInAs(1);
    const { user } = renderApp("/mylistings");
    await waitFor(() => expect(cards()).toHaveLength(4));
    await user.click(within(cards()[0] as HTMLElement).getByRole("button", { name: /^delete/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cards()).toHaveLength(4);
  });
});

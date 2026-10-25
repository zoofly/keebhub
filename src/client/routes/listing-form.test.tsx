import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { db } from "../mocks/db";
import { server } from "../mocks/node";
import { renderApp, signInAs } from "../test/render";

const field = (name: RegExp) => screen.getByLabelText(name);

describe("Create a listing", () => {
  it("sends guests to log in and back", async () => {
    const { router } = renderApp("/create");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Fcreate");
  });

  it("validates with the shared rules before sending", async () => {
    signInAs(1);
    const { user } = renderApp("/create");
    await screen.findByRole("heading", { level: 1, name: "Create a listing" });
    const before = db.state.postings.length;
    await user.type(field(/photo url/i), "javascript:alert(1)");
    await user.type(field(/price/i), "1e3");
    await user.click(screen.getByRole("button", { name: "Post listing" }));
    expect(screen.getByText("Title is required")).toBeVisible();
    expect(screen.getByText("Image URL must be an https:// link")).toBeVisible();
    expect(screen.getByText("Enter a price like 199.99 (0 to 99,999,999.99)")).toBeVisible();
    expect(field(/title/i)).toHaveFocus();
    expect(db.state.postings.length).toBe(before);

    await user.clear(field(/photo url/i));
    await user.type(field(/photo url/i), "http://example.com/a.jpg");
    await user.click(screen.getByRole("button", { name: "Post listing" }));
    expect(screen.getByText("Image URL must be an https:// link")).toBeVisible();
  });

  it("posts dollars as cents, shows the listing, and refreshes cached lists", async () => {
    signInAs(1);
    const { user, router, queryClient } = renderApp("/market");
    await waitFor(() => expect(screen.getAllByTestId("listing-card")).toHaveLength(12));
    await user.click(screen.getAllByRole("link", { name: "Create a listing" })[0] as HTMLElement);
    await screen.findByRole("heading", { level: 1, name: "Create a listing" });

    await user.type(field(/title/i), "E2E <b>board</b>");
    await user.type(field(/photo url/i), "https://img.keebhub.test/new.svg");
    await user.type(field(/price/i), "12.5");
    await user.type(field(/description/i), "<img src=x onerror=alert(1)> desc");
    await user.click(screen.getByRole("button", { name: "Post listing" }));

    await screen.findByRole("heading", { level: 1, name: "E2E <b>board</b>" });
    const created = db.state.postings.at(-1);
    expect(created?.priceCents).toBe(1250);
    expect(router.state.location.pathname).toBe(`/market/${created?.id}`);
    expect(screen.getByText("$12.50")).toBeVisible();
    expect(await screen.findByText("Listing posted!")).toBeInTheDocument();
    // The market list was invalidated, so it refetches with the new post first.
    expect(queryClient.getQueryState(["postings", "list"])?.isInvalidated).toBe(true);
  });

  it("maps a 400 with fields from the server onto the form", async () => {
    signInAs(1);
    server.use(
      http.post("/api/postings", () =>
        HttpResponse.json(
          {
            error: {
              code: "validation_failed",
              message: "Invalid request",
              fields: { priceCents: ["Price is too high"], title: ["Title is not allowed"] },
            },
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp("/create");
    await screen.findByRole("heading", { level: 1, name: "Create a listing" });
    await user.type(field(/title/i), "Keyboard");
    await user.type(field(/photo url/i), "https://img.keebhub.test/k.svg");
    await user.type(field(/price/i), "10");
    await user.click(screen.getByRole("button", { name: "Post listing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't accept that listing/);
    expect(screen.getByText("Price is too high")).toBeVisible();
    expect(screen.getByText("Title is not allowed")).toBeVisible();
  });
});

describe("Create a listing: listing caps (429 listing_limit)", () => {
  const fillValidForm = async (user: ReturnType<typeof renderApp>["user"]) => {
    await user.type(field(/title/i), "Cap test board");
    await user.type(field(/photo url/i), "https://img.keebhub.test/cap.svg");
    await user.type(field(/price/i), "42.50");
    await user.type(field(/description/i), "Keep me");
  };

  it("shows the server's message and the Retry-After wait, keeps the input, stays put", async () => {
    signInAs(1);
    server.use(
      http.post("/api/postings", () =>
        HttpResponse.json(
          {
            error: {
              code: "listing_limit",
              message: "You can create up to 20 listings an hour.",
            },
          },
          { status: 429, headers: { "Retry-After": "1500" } },
        ),
      ),
    );
    const { user, router } = renderApp("/create");
    await screen.findByRole("heading", { level: 1, name: "Create a listing" });
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Post listing" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "You can create up to 20 listings an hour. Please wait about 25 minutes and try again.",
    );
    expect(alert).toHaveFocus();
    expect(router.state.location.pathname).toBe("/create");
    expect(field(/title/i)).toHaveValue("Cap test board");
    expect(field(/photo url/i)).toHaveValue("https://img.keebhub.test/cap.svg");
    expect(field(/price/i)).toHaveValue("42.50");
    expect(field(/description/i)).toHaveValue("Keep me");
    expect(screen.getByRole("button", { name: "Post listing" })).toBeEnabled();
    expect(screen.queryByText("Listing posted!")).toBeNull();
  });

  it("shows the active-listing cap from the mock API (no Retry-After)", async () => {
    signInAs(1);
    // kash already has 4 seeded listings; top up to 50.
    for (let n = 0; n < 46; n += 1) {
      db.state.postings.push({
        id: 5000 + n,
        userId: 1,
        title: `Filler ${n}`,
        description: "",
        imageUrl: "https://img.keebhub.test/f.svg",
        priceCents: 100,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    const { user, router } = renderApp("/create");
    await screen.findByRole("heading", { level: 1, name: "Create a listing" });
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Post listing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can have up to 50 active listings. Delete one to post another.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/wait/);
    expect(router.state.location.pathname).toBe("/create");
    expect(field(/title/i)).toHaveValue("Cap test board");
  });
});

describe("Edit a listing", () => {
  it("pre-fills the price as dollars and saves", async () => {
    signInAs(1);
    const own = db.state.postings.find((posting) => posting.id === 6);
    if (own) {
      own.priceCents = 1250;
    }
    const { user, router } = renderApp("/market/6/edit");
    await screen.findByRole("heading", { level: 1, name: "Edit listing" });
    expect(field(/price/i)).toHaveValue("12.50");
    await user.clear(field(/title/i));
    await user.type(field(/title/i), "E2E board edited");
    await user.clear(field(/price/i));
    await user.type(field(/price/i), "15");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("heading", { level: 1, name: "E2E board edited" });
    expect(router.state.location.pathname).toBe("/market/6");
    expect(screen.getByText("$15.00")).toBeVisible();
    expect(db.state.postings.find((posting) => posting.id === 6)?.priceCents).toBe(1500);
  });

  it("won't edit someone else's listing", async () => {
    signInAs(1);
    renderApp("/market/2/edit"); // bench's
    expect(
      await screen.findByRole("heading", { level: 1, name: "Can't edit this listing" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("shows the 404 message if the listing disappears while editing", async () => {
    signInAs(1);
    const { user } = renderApp("/market/6/edit");
    await screen.findByRole("heading", { level: 1, name: "Edit listing" });
    db.state.postings = db.state.postings.filter((posting) => posting.id !== 6);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be found/);
  });
});

describe("Listing detail", () => {
  it("is public and shows the seller", async () => {
    renderApp("/market/2");
    expect(await screen.findByRole("heading", { level: 1, name: /Tofu65/ })).toBeVisible();
    expect(screen.getByText(/Sold by bench/)).toBeVisible();
    expect(screen.getByRole("link", { name: /log in to save/i })).toHaveAttribute(
      "href",
      "/login?next=%2Fmarket%2F2",
    );
  });

  it.each(["abc", "0", "99999999999"])("treats /market/%s as not found", async (id) => {
    renderApp(`/market/${id}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });

  it("says when a listing is gone", async () => {
    renderApp("/market/999");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Listing not found" }),
    ).toBeVisible();
    expect(
      within(screen.getByRole("main")).getByRole("link", { name: "Browse the market" }),
    ).toBeVisible();
  });
});

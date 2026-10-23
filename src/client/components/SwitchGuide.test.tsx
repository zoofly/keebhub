import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { db } from "../mocks/db";
import { renderApp } from "../test/render";

describe("Switch guide", () => {
  it("lists the catalog by name and filters by type", async () => {
    const { user } = renderApp("/about");
    await screen.findByRole("heading", { level: 1 });
    // The guide lives on the home page.
    await user.click(screen.getByRole("link", { name: "Keebhub" }));
    const section = await screen.findByRole("region", { name: "Switch guide" });
    await waitFor(() => expect(within(section).getAllByRole("article")).toHaveLength(20));
    expect(within(section).getAllByRole("article")[0]).toHaveTextContent("Akko CS Jelly Pink");

    const clicky = within(section).getByRole("button", { name: "Clicky" });
    await user.click(clicky);
    expect(clicky).toHaveAttribute("aria-pressed", "true");
    expect(within(section).getAllByRole("article")).toHaveLength(4);
  });

  it("shows an error with a working retry", async () => {
    db.state.failNext["GET /api/switches"] = 2; // the query retries once
    const { user } = renderApp("/");
    const section = await screen.findByRole("region", { name: "Switch guide" });
    const alert = await within(section).findByRole("alert", {}, { timeout: 4000 });
    expect(alert).toHaveTextContent("Switches didn't load");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(section).getAllByRole("article")).toHaveLength(20));
  });

  it("shows an empty state", async () => {
    db.state.switches = [];
    renderApp("/");
    expect(await screen.findByText("No switches yet")).toBeVisible();
  });
});

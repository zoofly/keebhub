import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, signInAs } from "../test/render";

const mainNav = () => screen.getByRole("navigation", { name: "Main" });
const linkNames = () =>
  within(mainNav())
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("Nav", () => {
  it("shows guest links when nobody is signed in", async () => {
    renderApp("/about");
    await waitFor(() => expect(linkNames()).toContain("Log in"));
    expect(linkNames()).toEqual(["Home", "Market", "About", "Log in", "Sign up"]);
    expect(within(mainNav()).queryByRole("button", { name: "Log out" })).toBeNull();
  });

  it("shows member links and Log out when signed in", async () => {
    signInAs(1);
    renderApp("/about");
    await waitFor(() => expect(linkNames()).toContain("My listings"));
    expect(linkNames()).toEqual(["Market", "My listings", "Saved", "Sell", "Profile", "About"]);
    expect(within(mainNav()).getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("marks the current page with aria-current", async () => {
    renderApp("/about");
    const about = await within(await screen.findByRole("navigation", { name: "Main" })).findByRole(
      "link",
      { name: "About" },
    );
    expect(about).toHaveAttribute("aria-current", "page");
  });

  it("toggles the phone menu, and Escape closes it and returns focus", async () => {
    const { user } = renderApp("/about");
    const toggle = await screen.findByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "primary-nav");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("closes the phone menu after navigating", async () => {
    const { user } = renderApp("/about");
    const toggle = await screen.findByRole("button", { name: "Menu" });
    await user.click(toggle);
    await user.click(within(mainNav()).getByRole("link", { name: "Market" }));
    await screen.findByRole("heading", { level: 1, name: "Market" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("logs out: clears every cached query and shows the guest nav", async () => {
    signInAs(1);
    const { user, queryClient, router } = renderApp("/mylistings");
    await screen.findByRole("heading", { level: 1, name: "My listings" });
    await screen.findAllByTestId("listing-card");
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(1);

    await user.click(within(mainNav()).getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(linkNames()).toContain("Log in"));
    // No signed-in data survives (a disabled, empty query may be re-created
    // by the page being left; it never fetches without a user).
    expect(queryClient.getQueryData(["me", "postings"])).toBeUndefined();
    expect(queryClient.getQueryData(["me"])).toBeNull();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});

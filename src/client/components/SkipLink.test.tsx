import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

describe("SkipLink", () => {
  it("is the first thing Tab reaches and targets <main>", async () => {
    const { user } = renderApp("/about");
    await screen.findByRole("heading", { level: 1, name: "About Keebhub" });
    await user.tab();
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute("href", "#main-content");
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus to <main> on client-side navigation", async () => {
    const { user } = renderApp("/about");
    await screen.findByRole("heading", { level: 1, name: "About Keebhub" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("link", { name: "Market" }));
    await screen.findByRole("heading", { level: 1, name: "Market" });
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });
});

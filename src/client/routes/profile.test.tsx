import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { db } from "../mocks/db";
import { MOCK_PASSPHRASE } from "../mocks/fixtures";
import { renderApp, signInAs } from "../test/render";

// Obviously fake test-only values.
const NEW_PASSWORD = "another fake passphrase";

describe("Profile", () => {
  it("redirects guests to log in", async () => {
    const { router } = renderApp("/profile");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Fprofile");
  });

  it("changes the password", async () => {
    signInAs(1);
    const { user } = renderApp("/profile");
    const section = await screen.findByRole("region", { name: "Change password" });
    await user.type(within(section).getByLabelText(/current password/i), MOCK_PASSPHRASE);
    await user.type(within(section).getByLabelText(/^new password/i), NEW_PASSWORD);
    await user.type(within(section).getByLabelText(/confirm new password/i), NEW_PASSWORD);
    await user.click(within(section).getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
    expect(db.state.users.find((u) => u.id === 1)?.passphrase).toBe(NEW_PASSWORD);
    expect(within(section).getByLabelText(/current password/i)).toHaveValue("");
  });

  it("a wrong current password is a field error (400), not a logout", async () => {
    signInAs(1);
    const { user, router } = renderApp("/profile");
    const section = await screen.findByRole("region", { name: "Change password" });
    await user.type(within(section).getByLabelText(/current password/i), "not it at all");
    await user.type(within(section).getByLabelText(/^new password/i), NEW_PASSWORD);
    await user.type(within(section).getByLabelText(/confirm new password/i), NEW_PASSWORD);
    await user.click(within(section).getByRole("button", { name: "Change password" }));
    expect(await within(section).findByText("That isn't your current password")).toBeVisible();
    expect(router.state.location.pathname).toBe("/profile");
  });

  it("checks that the new passwords match", async () => {
    signInAs(1);
    const { user } = renderApp("/profile");
    const section = await screen.findByRole("region", { name: "Change password" });
    await user.type(within(section).getByLabelText(/current password/i), MOCK_PASSPHRASE);
    await user.type(within(section).getByLabelText(/^new password/i), NEW_PASSWORD);
    await user.type(within(section).getByLabelText(/confirm new password/i), "something else");
    await user.click(within(section).getByRole("button", { name: "Change password" }));
    expect(within(section).getByText("The new passwords don't match")).toBeVisible();
  });

  it("deletes the account after confirming the password", async () => {
    signInAs(1);
    const { user, router, queryClient } = renderApp("/profile");
    const section = await screen.findByRole("region", { name: "Delete account" });
    await user.click(within(section).getByRole("button", { name: "Delete my account" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete your account?" });

    await user.type(within(dialog).getByLabelText(/password/i), "wrong password");
    await user.click(within(dialog).getByRole("button", { name: "Delete account" }));
    expect(await within(dialog).findByText("That password isn't right.")).toBeVisible();

    await user.type(within(dialog).getByLabelText(/password/i), MOCK_PASSPHRASE);
    await user.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(db.state.users.some((u) => u.id === 1)).toBe(false);
    expect(queryClient.getQueryData(["me"])).toBeNull();
  });
});

describe("Session expiry (401)", () => {
  it("drops to login with ?next= and clears signed-in data, without a request loop", async () => {
    signInAs(1);
    const { user, router, queryClient } = renderApp("/profile");
    await screen.findByRole("heading", { level: 1, name: "Hi, kash!" });
    db.state.sessionUserId = null; // the server forgot the session
    const nav = screen.getByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("link", { name: "My listings" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Fmylistings");
    expect(queryClient.getQueryData(["me"])).toBeNull();
    expect(queryClient.getQueryData(["me", "postings"])).toBeUndefined();
    expect(await screen.findByRole("form", { name: "Log in" })).toBeVisible();
  });
});

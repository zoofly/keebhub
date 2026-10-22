import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { USERNAME_MAX, USERNAME_MIN } from "../../shared/limits";
import { db } from "../mocks/db";
import { MOCK_FAILING_TURNSTILE_TOKEN, MOCK_PASSPHRASE } from "../mocks/fixtures";
import { installFakeTurnstile, renderApp } from "../test/render";

// Obviously fake test-only values.
const NEW_PASSWORD = "fake test passphrase";
const WRONG_PASSWORD = "not the right one";

const form = (name: RegExp) => screen.getByRole("form", { name });

describe("Register", () => {
  it("shows the shared limits as inline errors without calling the API", async () => {
    installFakeTurnstile();
    const { user } = renderApp("/register");
    const register = await screen.findByRole("form", { name: /create an account/i });
    const usersBefore = db.state.users.length;

    await user.type(within(register).getByLabelText(/username/i), "ab");
    await user.type(within(register).getByLabelText(/password/i), "short");
    await user.click(within(register).getByRole("button", { name: "Create account" }));

    const username = within(register).getByLabelText(/username/i);
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAccessibleDescription(
      expect.stringContaining(`Username must be at least ${USERNAME_MIN} characters`),
    );
    expect(within(register).getByText("Password must be at least 8 characters")).toBeVisible();
    expect(username).toHaveFocus();
    expect(db.state.users.length).toBe(usersBefore);

    await user.clear(username);
    await user.type(username, "a".repeat(USERNAME_MAX + 1));
    await user.click(within(register).getByRole("button", { name: "Create account" }));
    expect(
      within(register).getByText(`Username must be at most ${USERNAME_MAX} characters`),
    ).toBeVisible();
  });

  it("uses autocomplete hints", async () => {
    renderApp("/register");
    const register = await screen.findByRole("form", { name: /create an account/i });
    expect(within(register).getByLabelText(/username/i)).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(within(register).getByLabelText(/password/i)).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("shows the 409 message on the username field (case-insensitive duplicate)", async () => {
    installFakeTurnstile();
    const { user } = renderApp("/register");
    await screen.findByRole("form", { name: /create an account/i });
    await user.type(screen.getByLabelText(/username/i), "BENCH");
    await user.type(screen.getByLabelText(/password/i), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    const alert = await within(form(/create an account/i)).findByRole("alert");
    expect(alert).toHaveTextContent("That username is already taken. Try another one.");
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText(/username/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("explains a failed bot check (403)", async () => {
    installFakeTurnstile(MOCK_FAILING_TURNSTILE_TOKEN);
    const { user } = renderApp("/register");
    await screen.findByRole("form", { name: /create an account/i });
    await user.type(screen.getByLabelText(/username/i), "newperson");
    await user.type(screen.getByLabelText(/password/i), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await within(form(/create an account/i)).findByRole("alert")).toHaveTextContent(
      /couldn't confirm you're a person/,
    );
  });

  it("signs in on 201 and goes to ?next=, never an outside URL", async () => {
    installFakeTurnstile();
    const { user, router } = renderApp("/register?next=%2Fsaved");
    await screen.findByRole("form", { name: /create an account/i });
    await user.type(screen.getByLabelText(/username/i), "newperson");
    await user.type(screen.getByLabelText(/password/i), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/saved"));
    expect(db.state.users.some((u) => u.username === "newperson")).toBe(true);
  });

  it("asks for the security check before sending anything", async () => {
    // No Turnstile token yet (the widget hasn't produced one).
    const { user } = renderApp("/register");
    await screen.findByRole("form", { name: /create an account/i });
    await user.type(screen.getByLabelText(/username/i), "newperson");
    await user.type(screen.getByLabelText(/password/i), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/security check/);
  });
});

describe("Login", () => {
  it("shows one message for a wrong password and clears the password", async () => {
    installFakeTurnstile();
    const { user } = renderApp("/login");
    await screen.findByRole("form", { name: "Log in" });
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autocomplete", "current-password");
    await user.type(screen.getByLabelText(/username/i), "kash");
    await user.type(screen.getByLabelText(/password/i), WRONG_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await within(form(/log in/i)).findByRole("alert")).toHaveTextContent(
      "That username and password didn't match. Please try again.",
    );
    expect(screen.getByLabelText(/password/i)).toHaveValue("");
  });

  it("shows the wait time from Retry-After when locked out (429)", async () => {
    installFakeTurnstile();
    db.state.failedLogins.kash = 10;
    const { user } = renderApp("/login");
    await screen.findByRole("form", { name: "Log in" });
    await user.type(screen.getByLabelText(/username/i), "kash");
    await user.type(screen.getByLabelText(/password/i), WRONG_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await within(form(/log in/i)).findByRole("alert")).toHaveTextContent(
      "Too many attempts in a short time. Please wait about 15 minutes and try again.",
    );
  });

  it("never leaves the password in the DOM or the console after submitting", async () => {
    installFakeTurnstile();
    const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method),
    );
    const { user, router } = renderApp("/login?next=%2Fmylistings");
    await screen.findByRole("form", { name: "Log in" });
    await user.type(screen.getByLabelText(/username/i), "kash");
    await user.type(screen.getByLabelText(/password/i), MOCK_PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/mylistings"));

    expect(document.documentElement.outerHTML).not.toContain(MOCK_PASSPHRASE);
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(MOCK_PASSPHRASE);
      }
      spy.mockRestore();
    }
  });

  it.each(["//evil.com", "https://evil.com", "/\\evil.com"])(
    "ignores an outside ?next=%s and goes to the market",
    async (next) => {
      installFakeTurnstile();
      const { user, router } = renderApp(`/login?next=${encodeURIComponent(next)}`);
      await screen.findByRole("form", { name: "Log in" });
      await user.type(screen.getByLabelText(/username/i), "kash");
      await user.type(screen.getByLabelText(/password/i), MOCK_PASSPHRASE);
      await user.click(screen.getByRole("button", { name: "Log in" }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/market"));
    },
  );
});

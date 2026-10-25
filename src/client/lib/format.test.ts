import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../api";
import {
  listingErrorMessage,
  loginErrorMessage,
  rateLimitedMessage,
  registerErrorMessage,
  waitText,
} from "./errors";
import { displayPrice } from "./format";

describe("displayPrice", () => {
  it("formats cents as dollars, with 0 as Free / trade", () => {
    expect(displayPrice(19999)).toBe("$199.99");
    expect(displayPrice(1250)).toBe("$12.50");
    expect(displayPrice(9_999_999_999)).toBe("$99,999,999.99");
    expect(displayPrice(0)).toBe("Free / trade");
  });
});

describe("error messages", () => {
  it("shows the Retry-After wait for 429s", () => {
    expect(waitText(900)).toBe("about 15 minutes");
    expect(waitText(30)).toBe("a minute");
    expect(waitText(null)).toBe("a few minutes");
    const limited = new ApiRequestError(429, "rate_limited", "x", {}, 900);
    expect(rateLimitedMessage(limited)).toContain("about 15 minutes");
    expect(loginErrorMessage(limited)).toContain("Too many attempts");
  });

  it("uses one message for wrong username and wrong password", () => {
    expect(loginErrorMessage(new ApiRequestError(401, "unauthorized", "x"))).toBe(
      "That username and password didn't match. Please try again.",
    );
  });

  it("explains a failed bot check and a taken username", () => {
    expect(registerErrorMessage(new ApiRequestError(403, "forbidden", "x"))).toMatch(/check again/);
    expect(registerErrorMessage(new ApiRequestError(409, "conflict", "x"))).toMatch(
      /already taken/,
    );
    expect(registerErrorMessage(new ApiRequestError(0, "network", "x"))).toMatch(
      /reach the server/,
    );
  });
});

describe("listing cap messages (429 listing_limit)", () => {
  it("uses the server's message, adding the wait only when Retry-After is present", () => {
    const hourly = new ApiRequestError(
      429,
      "listing_limit",
      "You can create up to 20 listings an hour",
      {},
      600,
    );
    expect(listingErrorMessage(hourly)).toBe(
      "You can create up to 20 listings an hour. Please wait about 10 minutes and try again.",
    );
    const active = new ApiRequestError(429, "listing_limit", "You have 50 active listings.");
    expect(listingErrorMessage(active)).toBe("You have 50 active listings.");
  });

  it("doesn't repeat the wait when the server's message already gives it", () => {
    const server = "You can post up to 20 listings an hour. Try again in 12 minutes.";
    const hourly = new ApiRequestError(429, "listing_limit", server, {}, 700);
    expect(listingErrorMessage(hourly)).toBe(server);
  });

  it("keeps the generic message for other 429s", () => {
    const limited = new ApiRequestError(429, "rate_limited", "Too many", {}, 60);
    expect(listingErrorMessage(limited)).toBe(rateLimitedMessage(limited));
  });
});

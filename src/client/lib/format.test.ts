import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../api";
import { loginErrorMessage, rateLimitedMessage, registerErrorMessage, waitText } from "./errors";
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

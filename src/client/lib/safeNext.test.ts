import { describe, expect, it } from "vitest";
import { loginPathFor, safeNextPath } from "./safeNext";

describe("safeNextPath (open-redirect guard for ?next=)", () => {
  it.each([
    ["/market", "/market"],
    ["/market/12?x=1#top", "/market/12?x=1#top"],
    ["/mylistings", "/mylistings"],
    // Percent-encoding stays an inert same-origin path.
    ["/%0d%0aSet-Cookie:x", "/%0d%0aSet-Cookie:x"],
  ])("allows the same-origin path %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "//evil.com/market",
    "https://evil.com",
    "http://evil.com/market",
    "javascript:alert(1)",
    "/\\evil.com",
    "\\\\evil.com",
    "/market\u0000",
    "market",
    "",
    null,
    undefined,
    "/login",
    "/register?next=/market",
    `/${"a".repeat(2100)}`,
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBeNull();
  });

  it("builds login links that come back to the page", () => {
    expect(loginPathFor("/market/3")).toBe("/login?next=%2Fmarket%2F3");
    expect(loginPathFor("/")).toBe("/login");
    expect(loginPathFor("//evil.com")).toBe("/login");
  });
});

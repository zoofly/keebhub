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
    // Dot segments that normalize to a protocol-relative "//evil.com".
    "/.//evil.com",
    "/..//evil.com",
    "/a/..//evil.com",
    "/%2e//evil.com",
    "/%2E%2E//evil.com/market",
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBeNull();
  });

  it("builds login links that come back to the page", () => {
    expect(loginPathFor("/market/3")).toBe("/login?next=%2Fmarket%2F3");
    expect(loginPathFor("/")).toBe("/login");
    expect(loginPathFor("//evil.com")).toBe("/login");
    expect(loginPathFor("/.//evil.com")).toBe("/login");
  });

  it("never returns anything that resolves to another origin", () => {
    const origin = "https://keebhub.example";
    const parts = ["/", "//", ".", "..", "%2e", "evil.com", "a", "?", "#", "%2F", "@", ":"];
    // Every combination of up to 4 parts (about 22,000 inputs).
    let inputs = [""];
    const all: string[] = [];
    for (let length = 1; length <= 4; length += 1) {
      inputs = inputs.flatMap((prefix) => parts.map((part) => prefix + part));
      all.push(...inputs);
    }
    for (const raw of all) {
      const safe = safeNextPath(raw);
      if (safe !== null) {
        expect(new URL(safe, origin).origin, JSON.stringify(raw)).toBe(origin);
        expect(safe.startsWith("//"), JSON.stringify(raw)).toBe(false);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { centsToDollarString, formatPrice, isValidCents, parseDollarsToCents } from "./money";

describe("parseDollarsToCents", () => {
  it.each([
    ["0", 0],
    ["0.5", 50],
    ["0.05", 5],
    ["5", 500],
    [" 199.99 ", 19999],
    ["199.9", 19990],
    ["99999999.99", 9_999_999_999],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });

  it.each([
    "",
    "   ",
    "-1",
    "+1",
    "1e20",
    "1e3",
    "1E3",
    "0x10",
    "0b1",
    "0o7",
    "Infinity",
    "NaN",
    "1,000",
    "1.234",
    ".5",
    "5.",
    "007",
    "100000000",
    "100000000.00",
    "$5",
    "5 00",
  ])("rejects %j", (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });
});

describe("cents helpers", () => {
  it("round-trips 199.99", () => {
    const cents = parseDollarsToCents("199.99");
    expect(cents).toBe(19999);
    expect(centsToDollarString(19999)).toBe("199.99");
  });

  it("formats for display", () => {
    expect(formatPrice(19999)).toBe("$199.99");
    expect(formatPrice(0)).toBe("$0.00");
    expect(formatPrice(9_999_999_999)).toBe("$99,999,999.99");
  });

  it("validates the cents range", () => {
    expect(isValidCents(0)).toBe(true);
    expect(isValidCents(9_999_999_999)).toBe(true);
    expect(isValidCents(-1)).toBe(false);
    expect(isValidCents(10_000_000_000)).toBe(false);
    expect(isValidCents(1.5)).toBe(false);
    expect(() => centsToDollarString(-1)).toThrow(RangeError);
  });
});

import { PRICE_MAX_CENTS } from "./limits";

/**
 * Plain decimal dollars: 1-8 integer digits (no leading zeros except a lone
 * "0") and up to two decimal places. Rejects signs, exponents ("1e3"), hex
 * ("0x10"), separators ("1,000"), "Infinity" and the empty string, all of
 * which `Number()` would happily accept.
 */
const DOLLARS_PATTERN = /^(0|[1-9]\d{0,7})(\.\d{1,2})?$/;

/**
 * Parses a dollar amount typed by a user ("199.99", " 5 ", "0.5") into
 * integer cents. Returns null when the input is not a plain decimal amount
 * between 0 and 99,999,999.99.
 */
export function parseDollarsToCents(input: string): number | null {
  const value = input.trim();
  const match = DOLLARS_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").slice(1).padEnd(2, "0");
  const cents = whole * 100 + Number(fraction);
  return cents <= PRICE_MAX_CENTS ? cents : null;
}

/** True for an integer number of cents in the allowed price range. */
export function isValidCents(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= PRICE_MAX_CENTS;
}

/** 19999 -> "199.99" (for form inputs). */
export function centsToDollarString(cents: number): string {
  if (!isValidCents(cents)) {
    throw new RangeError(`Invalid price in cents: ${cents}`);
  }
  const whole = Math.trunc(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** 19999 -> "$199.99" (for display). */
export function formatPrice(cents: number): string {
  return usd.format(Number(centsToDollarString(cents)));
}

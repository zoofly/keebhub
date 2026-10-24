// QA: randomized checks of the shared schemas and money helpers against
// simple reference rules. The generator is seeded, so a failure always
// reproduces; change SEED locally to explore other inputs.
import { describe, expect, it } from "vitest";
import { IMAGE_URL_MAX, PRICE_MAX_CENTS, USERNAME_MAX, USERNAME_MIN } from "./limits";
import { centsToDollarString, formatPrice, isValidCents, parseDollarsToCents } from "./money";
import { IdParam, ImageUrl, PageQuery, Password, PostingFormInput, Username } from "./schemas";

const SEED = 20261024;
const RUNS = 2000;

/** mulberry32: small, fast, seedable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(SEED);
const int = (max: number) => Math.floor(random() * max);
const pick = <T>(items: readonly T[]): T => items[int(items.length)] as T;

const PRICE_ALPHABET = [
  "0",
  "1",
  "2",
  "5",
  "9",
  ".",
  "-",
  "+",
  "e",
  "E",
  "x",
  ",",
  " ",
  "_",
  "١",
  "１",
  " ",
  "Infinity",
];
const TEXT_ALPHABET = [
  "a",
  "Z",
  "0",
  "9",
  ".",
  "_",
  "-",
  " ",
  "\t",
  "\n",
  "\u0000",
  "/",
  "\\",
  ":",
  "@",
  "%",
  "#",
  "?",
  "é",
  "é",
  "а",
  "K",
  "İ",
  "​",
  "‮",
  "ａ",
  "\u{1f511}",
  "<",
  ">",
  '"',
  "'",
];

const randomString = (alphabet: readonly string[], maxParts: number) =>
  Array.from({ length: int(maxParts) + 1 }, () => pick(alphabet)).join("");

/** Reference: exact decimal parsing with BigInt, no floating point anywhere. */
function referenceCents(input: string): number | null {
  const value = input.trim();
  const match = /^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) {
    return null;
  }
  const cents = BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return cents <= BigInt(PRICE_MAX_CENTS) ? Number(cents) : null;
}

describe(`money (seed ${SEED})`, () => {
  it("parseDollarsToCents agrees with an exact BigInt reference on random input", () => {
    for (let i = 0; i < RUNS; i += 1) {
      const input = randomString(PRICE_ALPHABET, 12);
      expect(parseDollarsToCents(input), JSON.stringify(input)).toBe(referenceCents(input));
    }
  });

  it("every valid cents value survives cents -> dollar string -> cents unchanged", () => {
    const samples = [0, 1, 9, 10, 99, 100, 101, 19999, PRICE_MAX_CENTS - 1, PRICE_MAX_CENTS];
    for (let i = 0; i < RUNS; i += 1) {
      samples.push(int(PRICE_MAX_CENTS + 1));
    }
    for (const cents of samples) {
      const dollars = centsToDollarString(cents);
      expect(dollars).toMatch(/^\d{1,8}\.\d\d$/);
      expect(parseDollarsToCents(dollars), dollars).toBe(cents);
      expect(
        PostingFormInput.parse({
          title: "t",
          description: "",
          imageUrl: "https://e.com/a",
          price: dollars,
        }).priceCents,
      ).toBe(cents);
      // Display: grouping and two decimals, never scientific notation.
      expect(formatPrice(cents)).toMatch(/^\$\d{1,3}(,\d{3})*\.\d\d$/);
    }
  });

  it.each([
    "0x10",
    "1e3",
    "1E3",
    "-1",
    "+1",
    "1,000",
    "1_000",
    "Infinity",
    "NaN",
    "",
    " ",
    ".5",
    "5.",
    "1.234",
    "00",
    "01",
    "100000000",
    "99999999.999",
    "١٢",
    "１",
  ])("rejects %j", (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });

  it("isValidCents and centsToDollarString refuse anything that isn't integer cents in range", () => {
    for (const bad of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      PRICE_MAX_CENTS + 1,
      2 ** 53,
    ]) {
      expect(isValidCents(bad), String(bad)).toBe(false);
      expect(() => centsToDollarString(bad)).toThrow(RangeError);
    }
  });
});

describe(`usernames (seed ${SEED})`, () => {
  it("anything accepted is 3-32 ASCII [A-Za-z0-9._-] starting with a letter or digit, after trimming", () => {
    let accepted = 0;
    const NAME_ALPHABET = ["a", "Z", "q", "0", "7", ".", "_", "-", " "];
    for (let i = 0; i < RUNS; i += 1) {
      // Half fully random, half mostly-valid names (with a stray character or space).
      const input =
        i % 2 === 0
          ? randomString(TEXT_ALPHABET, 40)
          : randomString(NAME_ALPHABET, 36) + (int(4) === 0 ? pick(TEXT_ALPHABET) : "");
      const result = Username.safeParse(input);
      if (result.success) {
        accepted += 1;
        expect(result.data, JSON.stringify(input)).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/);
        expect(result.data).toBe(input.trim());
        expect(result.data.length).toBeGreaterThanOrEqual(USERNAME_MIN);
        expect(result.data.length).toBeLessThanOrEqual(USERNAME_MAX);
      }
    }
    // The generator does produce valid names now and then.
    expect(accepted).toBeGreaterThan(0);
  });
});

describe(`passwords (seed ${SEED})`, () => {
  it("length is counted in code points after NFC, so composed and decomposed forms agree", () => {
    for (let i = 0; i < RUNS; i += 1) {
      const input = randomString(TEXT_ALPHABET, 140);
      const nfd = input.normalize("NFD");
      const a = Password.safeParse(input);
      const b = Password.safeParse(nfd);
      expect(a.success, JSON.stringify(input)).toBe(b.success);
      const points = [...input.normalize("NFC")].length;
      expect(a.success).toBe(points >= 8 && points <= 128);
      if (a.success && b.success) {
        expect(a.data).toBe(b.data);
      }
    }
  });
});

describe(`image URLs (seed ${SEED})`, () => {
  const PARTS = [
    "https://",
    "HTTPS://",
    "http://",
    "https:",
    "https:/",
    "//",
    "javascript:",
    "data:",
    "img.example.com",
    "/a.jpg",
    "u:p@",
    "@",
    ":8443",
    "?q=1",
    "#f",
    " ",
    "\t",
    "\\",
    "%2F",
    "é",
    "\u0000",
  ];

  it("anything accepted is written https://, parses as https with no credentials, and fits", () => {
    let accepted = 0;
    for (let i = 0; i < RUNS; i += 1) {
      const input = randomString(PARTS, 6);
      const result = ImageUrl.safeParse(input);
      if (result.success) {
        accepted += 1;
        expect(result.data, JSON.stringify(input)).toMatch(/^https:\/\//i);
        const url = new URL(result.data);
        expect(url.protocol).toBe("https:");
        expect(url.username).toBe("");
        expect(url.password).toBe("");
        expect(result.data.length).toBeLessThanOrEqual(IMAGE_URL_MAX);
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });
});

describe(`ids and paging (seed ${SEED})`, () => {
  it("IdParam accepts exactly the decimal integers 1..2147483647", () => {
    for (let i = 0; i < RUNS; i += 1) {
      const input = randomString(["0", "1", "2", "9", "-", "+", ".", "e", "x", " ", "１"], 12);
      const result = IdParam.safeParse(input);
      const expected = /^[1-9][0-9]*$/.test(input) && BigInt(input) <= 2147483647n;
      expect(result.success, JSON.stringify(input)).toBe(expected);
      if (result.success) {
        expect(result.data).toBe(Number(input));
      }
    }
  });

  it("PageQuery clamps any digit string to 1..100 and rejects everything else", () => {
    for (let i = 0; i < RUNS; i += 1) {
      const input = randomString(["0", "1", "5", "9", "-", ".", "e", " ", "a"], 11);
      const result = PageQuery.safeParse({ limit: input });
      expect(result.success, JSON.stringify(input)).toBe(/^\d{1,9}$/.test(input));
      if (result.success) {
        expect(result.data.limit).toBe(Math.min(Math.max(Number(input), 1), 100));
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  ApiError,
  IdParam,
  ImageUrl,
  LoginInput,
  normalizeUsername,
  PageQuery,
  Password,
  PostingFormInput,
  PostingInput,
  RegisterInput,
  Username,
} from "./schemas";

// Obviously fake test-only values.
const TURNSTILE = "fake-turnstile";
const PASSWORD = "fake test words";

// An https URL carrying credentials, built rather than written out.
const urlWithCredentials = (() => {
  const url = new URL("https://example.com/kb.jpg");
  url.username = "someone";
  url.password = "x";
  return url.href;
})();

const validPosting = {
  title: "GMMK Pro",
  description: "Lubed, filmed, great condition",
  imageUrl: "https://example.com/gmmk.jpg",
  priceCents: 19999,
};

const validForm = {
  title: "GMMK Pro",
  description: "Lubed, filmed, great condition",
  imageUrl: "https://example.com/gmmk.jpg",
  price: "199.99",
};

describe("Username", () => {
  it.each(["kash", "Kash", "k.moua", "key_board-99", "abc", "a".repeat(32), "9lives"])(
    "accepts %j",
    (name) => {
      expect(Username.safeParse(name).success).toBe(true);
    },
  );

  it("trims surrounding whitespace", () => {
    expect(Username.parse("  kash  ")).toBe("kash");
  });

  it.each([
    "",
    "ab",
    "a".repeat(33),
    "has space",
    "émile",
    "kash!",
    "<script>",
    "-dash",
    ".dot",
    "_under",
    "name@example.com",
  ])("rejects %j", (name) => {
    expect(Username.safeParse(name).success).toBe(false);
  });

  it("rejects non-strings", () => {
    for (const value of [123, null, undefined, ["kash"], { name: "kash" }]) {
      expect(Username.safeParse(value).success).toBe(false);
    }
  });

  it("normalizes for case-insensitive comparison", () => {
    expect(normalizeUsername("  Kash ")).toBe("kash");
    expect(normalizeUsername("ALICE")).toBe(normalizeUsername("alice"));
  });
});

describe("Password", () => {
  it("accepts 8 to 128 characters, including spaces and Unicode", () => {
    expect(Password.safeParse("12345678").success).toBe(true);
    expect(Password.safeParse(PASSWORD).success).toBe(true);
    expect(Password.safeParse("p".repeat(128)).success).toBe(true);
    // 8 emoji are 8 code points (16 UTF-16 units)
    expect(Password.safeParse("🔑".repeat(8)).success).toBe(true);
  });

  it("rejects too short, too long and non-strings", () => {
    expect(Password.safeParse("1234567").success).toBe(false);
    expect(Password.safeParse("p".repeat(129)).success).toBe(false);
    expect(Password.safeParse("🔑".repeat(129)).success).toBe(false);
    expect(Password.safeParse(12345678).success).toBe(false);
  });

  it("NFC-normalizes", () => {
    const decomposed = "café-latte"; // e + combining acute
    expect(Password.parse(decomposed)).toBe("café-latte");
  });
});

describe("RegisterInput and LoginInput", () => {
  it("accept valid credentials", () => {
    const input = {
      username: "kash",
      password: PASSWORD,
      turnstileToken: TURNSTILE,
    };
    expect(RegisterInput.safeParse(input).success).toBe(true);
    expect(LoginInput.safeParse(input).success).toBe(true);
  });

  it("require a Turnstile token", () => {
    expect(RegisterInput.safeParse({ username: "kash", password: PASSWORD }).success).toBe(false);
    expect(
      LoginInput.safeParse({
        username: "kash",
        password: PASSWORD,
        turnstileToken: "",
      }).success,
    ).toBe(false);
  });

  it("reject non-string credentials", () => {
    const login = LoginInput.safeParse({
      username: ["kash"],
      password: { a: 1 },
      turnstileToken: TURNSTILE,
    });
    expect(login.success).toBe(false);
  });

  it("login does not apply the new-account rules", () => {
    // A short password can't exist, but login must not say why it failed.
    expect(
      LoginInput.safeParse({
        username: "kash",
        password: "short",
        turnstileToken: TURNSTILE,
      }).success,
    ).toBe(true);
  });
});

describe("ImageUrl", () => {
  it("accepts https URLs", () => {
    expect(ImageUrl.safeParse("https://example.com/kb.jpg").success).toBe(true);
    expect(ImageUrl.safeParse("HTTPS://EXAMPLE.COM/KB.JPG").success).toBe(true);
  });

  it.each([
    "",
    "http://example.com/kb.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "//example.com/kb.jpg",
    "/kb.jpg",
    "not a url",
    urlWithCredentials,
    `https://example.com/${"a".repeat(2048)}`,
    // new URL() reads these as https, but D1's CHECK (LIKE 'https://%')
    // refused them, so the API answered 500 instead of 400.
    "https:example.com/kb.jpg",
    "https:/example.com/kb.jpg",
    "https:\\\\example.com\\kb.jpg",
  ])("rejects %j", (url) => {
    expect(ImageUrl.safeParse(url).success).toBe(false);
  });
});

describe("PostingInput (API body, integer cents)", () => {
  it("accepts a valid posting and defaults the description", () => {
    expect(PostingInput.parse(validPosting)).toEqual(validPosting);
    const { description: _omit, ...withoutDescription } = validPosting;
    expect(PostingInput.parse(withoutDescription).description).toBe("");
  });

  it.each([
    ["blank title", { title: "   " }],
    ["title too long", { title: "t".repeat(201) }],
    ["description too long", { description: "d".repeat(5001) }],
    ["javascript: image", { imageUrl: "javascript:alert(1)" }],
    ["http image", { imageUrl: "http://example.com/a.jpg" }],
    ["negative price", { priceCents: -1 }],
    ["fractional cents", { priceCents: 1.5 }],
    ["price over the cap", { priceCents: 10_000_000_000 }],
    ["huge price", { priceCents: 1e22 }],
    ["string price", { priceCents: "19999" }],
    ["missing price", { priceCents: undefined }],
  ])("rejects %s", (_label, override) => {
    expect(PostingInput.safeParse({ ...validPosting, ...override }).success).toBe(false);
  });
});

describe("PostingFormInput (dollars typed in a form)", () => {
  it("converts dollars to cents", () => {
    expect(PostingFormInput.parse(validForm)).toEqual({
      title: "GMMK Pro",
      description: "Lubed, filmed, great condition",
      imageUrl: "https://example.com/gmmk.jpg",
      priceCents: 19999,
    });
  });

  // Every bad-posting case from the legacy route tests, plus the stricter
  // price rules from the review.
  it.each([
    ["blank title", { title: "  " }],
    ["javascript: image", { imageUrl: "javascript:alert(1)" }],
    ["-1", { price: "-1" }],
    ["empty price", { price: "" }],
    ["1e20", { price: "1e20" }],
    ["exponent", { price: "1e3" }],
    ["hex", { price: "0x10" }],
    ["over 99,999,999.99", { price: "100000000" }],
    ["three decimals", { price: "1.999" }],
    ["number instead of string", { price: 5 }],
  ])("rejects %s", (_label, override) => {
    expect(PostingFormInput.safeParse({ ...validForm, ...override }).success).toBe(false);
  });
});

describe("IdParam", () => {
  it("accepts positive 32-bit integers", () => {
    expect(IdParam.parse("1")).toBe(1);
    expect(IdParam.parse("2147483647")).toBe(2147483647);
  });

  it.each(["abc", "0", "-1", "1.5", "01", "1e3", "0x10", "99999999999", "2147483648", ""])(
    "rejects %j",
    (value) => {
      expect(IdParam.safeParse(value).success).toBe(false);
    },
  );
});

describe("PageQuery", () => {
  it("defaults and clamps the limit", () => {
    expect(PageQuery.parse({})).toEqual({ limit: 20 });
    expect(PageQuery.parse({ limit: "5" }).limit).toBe(5);
    expect(PageQuery.parse({ limit: "0" }).limit).toBe(1);
    expect(PageQuery.parse({ limit: "100000" }).limit).toBe(100);
  });

  it("rejects malformed limits and cursors", () => {
    for (const limit of ["abc", "-1", "1e2", "2.5"]) {
      expect(PageQuery.safeParse({ limit }).success).toBe(false);
    }
    expect(PageQuery.safeParse({ cursor: "not a cursor!" }).success).toBe(false);
    expect(PageQuery.safeParse({ cursor: "a".repeat(201) }).success).toBe(false);
    expect(PageQuery.parse({ cursor: "MTIz" }).cursor).toBe("MTIz");
  });
});

describe("ApiError", () => {
  it("describes the error body shape", () => {
    expect(ApiError.safeParse({ error: { code: "not_found", message: "Not found" } }).success).toBe(
      true,
    );
    expect(ApiError.safeParse({ error: "Not Found" }).success).toBe(false);
  });
});

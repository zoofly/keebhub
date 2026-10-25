// QA: hostile input at the API boundary. Usernames (unicode, homoglyphs,
// case), passwords (NFC, length in code points), prices (strict integer
// cents), image URLs (https only, no credentials), text limits, content
// types, malformed and oversized bodies, and path ids. Every refusal is a
// JSON {error} and writes nothing.
import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BODY_LIMIT_BYTES,
  DESCRIPTION_MAX,
  IMAGE_URL_MAX,
  PRICE_MAX_CENTS,
  TITLE_MAX,
} from "../../shared/limits";
import { PostingWithSeller } from "../../shared/schemas";
import {
  api,
  dbSnapshot,
  expectApiError,
  forgetRecentCreates,
  freshIp,
  GOOD_PASSWORD,
  loginUser,
  mockOutbound,
  ORIGIN,
  PASS_TOKEN,
  registerUser,
  validPosting,
} from "./helpers";

const db = env.DB;
let seller: string;

beforeAll(async () => {
  const spy = mockOutbound();
  seller = (await registerUser("input-seller")).cookie;
  spy.mockRestore();
});
beforeEach(async () => {
  mockOutbound();
  // These tests post many listings as one seller; the listing limits have
  // their own tests (listing-limits.test.ts), so start each test under them.
  await forgetRecentCreates(env.DB);
  await env.DB.prepare(
    "DELETE FROM postings WHERE user_id = (SELECT id FROM users WHERE username = 'input-seller')",
  ).run();
});
afterEach(() => vi.restoreAllMocks());

const register = (username: unknown, password: unknown = GOOD_PASSWORD) =>
  api("/api/auth/register", {
    body: { username, password, turnstileToken: PASS_TOKEN },
    ip: freshIp(),
  });

const post = (body: unknown) => api("/api/postings", { body, cookie: seller });

/** A URL with credentials, built with the URL API so none appears literally in the source. */
const withCredentials = (user: string, pass: string) => {
  const url = new URL("https://img.example.com/photo.jpg");
  url.username = user;
  url.password = pass;
  return url.href;
};

describe("usernames", () => {
  it.each([
    ["Cyrillic homoglyph", "аlice"],
    ["fullwidth letters", "ａｌｉｃｅ"],
    ["precomposed accent (NFC)", "alicé"],
    ["combining accent (NFD)", "alicé"],
    ["Kelvin sign", "Kash"],
    ["dotted capital I", "İstanbul"],
    ["zero-width space", "ali​ce"],
    ["NUL", "alice\u0000"],
    ["newline inside", "ali\nce"],
    ["leading dot", ".alice"],
    ["leading hyphen", "-alice"],
    ["leading underscore", "_alice"],
    ["inner space", "al ice"],
    ["markup", "<script>"],
    ["emoji", "alice\u{1f600}"],
    ["too short", "ab"],
    ["too long", "a".repeat(33)],
    ["empty", ""],
    ["only spaces", "     "],
  ])("rejects %s with 400 and no account", async (_label, username) => {
    const before = await dbSnapshot(db, ["users", "sessions"]);
    const body = await expectApiError(await register(username), 400, "validation_failed");
    expect(body.error.fields?.username).toBeDefined();
    expect(await dbSnapshot(db, ["users", "sessions"])).toEqual(before);
  });

  it.each([123, null, true, ["alice"], { name: "alice" }])(
    "rejects a non-string (%j)",
    async (username) => {
      await expectApiError(await register(username), 400, "validation_failed");
    },
  );

  it.each(["abc", "a".repeat(32), "a.b_c-d", "0day", "UPPER"])("accepts %s", async (username) => {
    expect((await register(username)).status).toBe(201);
  });

  it("is unique ignoring case and surrounding spaces, and keeps the first spelling", async () => {
    expect((await register("Mixed.Case")).status).toBe(201);
    for (const variant of ["mixed.case", "MIXED.CASE", "  mixed.CASE  ", "\tMixed.Case\n"]) {
      const body = await expectApiError(await register(variant), 409, "conflict");
      expect(body.error.fields?.username).toEqual(["That username is taken"]);
    }
    const rows = await db
      .prepare("SELECT username FROM users WHERE username = 'mixed.case'")
      .all<{ username: string }>();
    expect(rows.results).toEqual([{ username: "Mixed.Case" }]);
  });

  it("login is case-insensitive and answers with the stored spelling", async () => {
    await registerUser("CamelUser");
    for (const variant of ["cameluser", "CAMELUSER", "  CamelUser  "]) {
      const res = await loginUser(variant);
      expect(res.status, variant).toBe(200);
      expect(((await res.json()) as { user: { username: string } }).user.username).toBe(
        "CamelUser",
      );
    }
  });

  it("look-alike spellings of a real name never log in, even with the right password", async () => {
    await registerUser("kashtest");
    for (const variant of [
      "Kashtest", // Kelvin sign K
      "kаshtest", // Cyrillic a
      "ｋashtest", // fullwidth k
      "kashtest\u0000",
      "kashtest\u0000x",
      "kash​test",
      "kashtest́",
    ]) {
      const res = await loginUser(variant);
      expect(res.status, JSON.stringify(variant)).toBe(401);
    }
  });
});

describe("passwords", () => {
  it("compares NFC-normalized: typed composed or decomposed, it's the same password", async () => {
    const decomposed = "café fake words";
    const composed = "café fake words";
    await registerUser("nfc-user", decomposed);
    expect((await loginUser("nfc-user", composed)).status).toBe(200);
    expect((await loginUser("nfc-user", decomposed)).status).toBe(200);
  });

  it("counts length in code points: 128 emoji are fine, 129 aren't, and 8 is the minimum", async () => {
    const emoji = "\u{1f511}";
    expect((await register("emoji128", emoji.repeat(128))).status).toBe(201);
    expect((await loginUser("emoji128", emoji.repeat(128))).status).toBe(200);
    await expectApiError(await register("emoji129", emoji.repeat(129)), 400, "validation_failed");
    expect((await register("eight8", "12345678")).status).toBe(201);
    await expectApiError(await register("seven7", "1234567"), 400, "validation_failed");
  });

  it("login bounds the password size and type without a 500", async () => {
    await registerUser("bounded");
    expect((await loginUser("bounded", "x".repeat(512))).status).toBe(401);
    await expectApiError(await loginUser("bounded", "x".repeat(513)), 400, "validation_failed");
    for (const password of [12345678, null, ["fake test words"], { p: 1 }]) {
      const res = await api("/api/auth/login", {
        body: { username: "bounded", password, turnstileToken: PASS_TOKEN },
        ip: freshIp(),
      });
      await expectApiError(res, 400, "validation_failed");
    }
  });
});

describe("prices (integer cents only)", () => {
  it.each([
    -1,
    -0.5,
    0.5,
    1.5,
    0.1 + 0.2,
    PRICE_MAX_CENTS + 1,
    1e20,
    2 ** 53,
    Number.MAX_SAFE_INTEGER,
    "100",
    "0x10",
    "1e3",
    "",
    null,
    true,
    [100],
    { cents: 100 },
  ])("rejects %j with 400 and writes nothing", async (priceCents) => {
    const before = await dbSnapshot(db, ["postings"]);
    const body = await expectApiError(
      await post({ ...validPosting, priceCents }),
      400,
      "validation_failed",
    );
    expect(body.error.fields?.priceCents).toBeDefined();
    expect(await dbSnapshot(db, ["postings"])).toEqual(before);
  });

  it("rejects a missing price and overflowing JSON numbers (1e400)", async () => {
    const { priceCents: _omit, ...noPrice } = validPosting;
    await expectApiError(await post(noPrice), 400, "validation_failed");
    const overflow = await api("/api/postings", {
      rawBody: `{"title":"t","imageUrl":"https://example.com/a.jpg","priceCents":1e400}`,
      cookie: seller,
    });
    await expectApiError(overflow, 400, "validation_failed");
  });

  it("stores -0 as 0 and accepts JSON exponent notation for whole numbers (1E3 = 1000)", async () => {
    const zero = await api("/api/postings", {
      rawBody: `{"title":"t","imageUrl":"https://example.com/a.jpg","priceCents":-0}`,
      cookie: seller,
    });
    expect(zero.status).toBe(201);
    const zeroPosting = PostingWithSeller.parse(await zero.json());
    expect(Object.is(zeroPosting.priceCents, 0)).toBe(true);
    const exp = await api("/api/postings", {
      rawBody: `{"title":"t","imageUrl":"https://example.com/a.jpg","priceCents":1E3}`,
      cookie: seller,
    });
    expect(PostingWithSeller.parse(await exp.json()).priceCents).toBe(1000);
  });

  it("round-trips the boundaries and a random sample unchanged through POST, GET, PUT and D1", async () => {
    const samples = [0, 1, 99, 100, 19999, PRICE_MAX_CENTS - 1, PRICE_MAX_CENTS];
    for (let i = 0; i < 25; i += 1) {
      samples.push(Math.floor(Math.random() * (PRICE_MAX_CENTS + 1)));
    }
    for (const cents of samples) {
      await forgetRecentCreates(db); // 32 creates: stay under the hourly limit
      const created = PostingWithSeller.parse(
        await (await post({ ...validPosting, priceCents: cents })).json(),
      );
      expect(created.priceCents, String(cents)).toBe(cents);
      const fetched = PostingWithSeller.parse(
        await (await api(`/api/postings/${created.id}`)).json(),
      );
      expect(fetched.priceCents).toBe(cents);
      const stored = await db
        .prepare("SELECT price_cents, typeof(price_cents) AS t FROM postings WHERE id = ?")
        .bind(created.id)
        .first<{ price_cents: number; t: string }>();
      expect(stored).toEqual({ price_cents: cents, t: "integer" });
      const updated = await api(`/api/postings/${created.id}`, {
        method: "PUT",
        body: { ...validPosting, priceCents: PRICE_MAX_CENTS - cents },
        cookie: seller,
      });
      expect(PostingWithSeller.parse(await updated.json()).priceCents).toBe(
        PRICE_MAX_CENTS - cents,
      );
    }
  });
});

describe("image URLs (https only)", () => {
  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["upper-case javascript:", "JAVASCRIPT:alert(1)"],
    ["javascript: with a tab", "java\tscript:alert(1)"],
    ["data:", "data:image/png;base64,iVBORw0KGgo="],
    ["data: svg", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["http:", "http://example.com/a.jpg"],
    ["ftp:", "ftp://example.com/a.jpg"],
    ["blob:", "blob:https://example.com/uuid"],
    ["protocol-relative", "//example.com/a.jpg"],
    ["relative path", "/assets/a.jpg"],
    ["scheme only", "https://"],
    ["user and password", withCredentials("u", "p")],
    ["user only", withCredentials("u", "")],
    ["blank", "   "],
    ["too long", `https://example.com/${"a".repeat(IMAGE_URL_MAX)}`],
  ])("rejects %s with 400 and writes nothing", async (_label, imageUrl) => {
    const before = await dbSnapshot(db, ["postings"]);
    const body = await expectApiError(
      await post({ ...validPosting, imageUrl }),
      400,
      "validation_failed",
    );
    expect(body.error.fields?.imageUrl).toBeDefined();
    expect(await dbSnapshot(db, ["postings"])).toEqual(before);
  });

  // URLs that new URL() reads as https but that aren't written "https://...":
  // they passed the shared schema and then failed the D1 CHECK
  // (image_url LIKE 'https://%') as a 500. They must be a 400 like any other
  // bad URL.
  it.each([
    ["no slashes", "https:example.com/a.jpg"],
    ["one slash", "https:/example.com/a.jpg"],
    ["backslashes", "https:\\\\example.com\\a.jpg"],
  ])("rejects https %s with 400 (not a 500)", async (_label, imageUrl) => {
    const before = await dbSnapshot(db, ["postings"]);
    const body = await expectApiError(
      await post({ ...validPosting, imageUrl }),
      400,
      "validation_failed",
    );
    expect(body.error.fields?.imageUrl).toBeDefined();
    expect(await dbSnapshot(db, ["postings"])).toEqual(before);
  });

  it.each([
    "https://example.com/a.jpg",
    "HTTPS://EXAMPLE.COM/A.JPG",
    "https://example.com:8443/a.jpg?w=400&h=300#frag",
    "https://bücher.example/été.jpg",
    `https://example.com/${"a".repeat(IMAGE_URL_MAX - "https://example.com/".length)}`,
  ])("accepts %s", async (imageUrl) => {
    const res = await post({ ...validPosting, imageUrl });
    expect(res.status).toBe(201);
    expect(PostingWithSeller.parse(await res.json()).imageUrl).toBe(imageUrl);
  });

  it("trims surrounding whitespace before storing", async () => {
    const res = await post({ ...validPosting, imageUrl: "  https://example.com/t.jpg\n" });
    expect(PostingWithSeller.parse(await res.json()).imageUrl).toBe("https://example.com/t.jpg");
  });
});

describe("text fields", () => {
  it("title: trimmed, 1-200 characters, stored verbatim otherwise", async () => {
    for (const title of ["", " ", "\t\n", "x".repeat(TITLE_MAX + 1)]) {
      const body = await expectApiError(
        await post({ ...validPosting, title }),
        400,
        "validation_failed",
      );
      expect(body.error.fields?.title, JSON.stringify(title)).toBeDefined();
    }
    const max = await post({ ...validPosting, title: "x".repeat(TITLE_MAX) });
    expect(max.status).toBe(201);
    const html = `<img src=x onerror=alert(1)> & "quotes" 'single' ‮RTL`;
    const stored = PostingWithSeller.parse(
      await (await post({ ...validPosting, title: ` ${html} ` })).json(),
    );
    expect(stored.title).toBe(html);
  });

  it("description: optional (defaults to empty), at most 5000, any text", async () => {
    const { description: _omit, ...noDescription } = validPosting;
    const res = await post(noDescription);
    expect(PostingWithSeller.parse(await res.json()).description).toBe("");
    expect((await post({ ...validPosting, description: "d".repeat(DESCRIPTION_MAX) })).status).toBe(
      201,
    );
    const tooLong = await post({ ...validPosting, description: "d".repeat(DESCRIPTION_MAX + 1) });
    expect(
      (await expectApiError(tooLong, 400, "validation_failed")).error.fields?.description,
    ).toBeDefined();
    await expectApiError(
      await post({ ...validPosting, description: 42 }),
      400,
      "validation_failed",
    );
  });

  it("a PUT without a description clears it (full replace, documented)", async () => {
    const created = PostingWithSeller.parse(await (await post(validPosting)).json());
    const { description: _omit, ...noDescription } = validPosting;
    const res = await api(`/api/postings/${created.id}`, {
      method: "PUT",
      body: noDescription,
      cookie: seller,
    });
    expect(PostingWithSeller.parse(await res.json()).description).toBe("");
  });

  it("reports every bad field at once", async () => {
    const res = await post({ title: "", imageUrl: "http://x", priceCents: -1, description: 1 });
    const body = await expectApiError(res, 400, "validation_failed");
    expect(Object.keys(body.error.fields ?? {}).sort()).toEqual([
      "description",
      "imageUrl",
      "priceCents",
      "title",
    ]);
  });
});

describe("request bodies", () => {
  it.each([
    "application/json-patch+json",
    "application/jsonx",
    "text/json",
    "text/plain",
    "text/plain;charset=UTF-8",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
    "application/xml",
    "application/octet-stream",
  ])("Content-Type %s is a 415 and writes nothing", async (contentType) => {
    const before = await dbSnapshot(db, ["postings"]);
    const res = await api("/api/postings", { body: validPosting, cookie: seller, contentType });
    await expectApiError(res, 415, "unsupported_media_type");
    expect(await dbSnapshot(db, ["postings"])).toEqual(before);
  });

  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "APPLICATION/JSON",
    "application/json;charset=UTF-8",
  ])("Content-Type %s is accepted", async (contentType) => {
    expect(
      (await api("/api/postings", { body: validPosting, cookie: seller, contentType })).status,
    ).toBe(201);
  });

  it.each([
    ["truncated", '{"title":"t"'],
    ["single quotes", "{'title':'t'}"],
    ["trailing comma", '{"title":"t",}'],
    ["empty", ""],
    ["undefined", "undefined"],
    ["byte-order mark", '﻿{"title":"t"}'],
    ["NaN", '{"priceCents":NaN}'],
  ])("malformed JSON (%s) is a 400", async (_label, rawBody) => {
    const res = await api("/api/postings", {
      rawBody,
      cookie: seller,
      contentType: "application/json",
    });
    await expectApiError(res, 400, "validation_failed");
  });

  it.each(["null", "[]", '"a string"', "42", "true"])(
    "a JSON %s instead of an object is a 400",
    async (rawBody) => {
      const res = await api("/api/postings", {
        rawBody,
        cookie: seller,
        contentType: "application/json",
      });
      await expectApiError(res, 400, "validation_failed");
    },
  );

  it("deeply nested JSON is a 400, not a crash", async () => {
    const depth = 40_000;
    const res = await api("/api/postings", {
      rawBody: `${"[".repeat(depth)}${"]".repeat(depth)}`,
      cookie: seller,
      contentType: "application/json",
    });
    await expectApiError(res, 400, "validation_failed");
  });

  it("__proto__ and constructor keys are ignored, not merged", async () => {
    const res = await api("/api/postings", {
      rawBody: JSON.stringify(validPosting).replace(
        /^\{/,
        '{"__proto__":{"userId":1,"polluted":true},"constructor":{"prototype":{"polluted":true}},',
      ),
      cookie: seller,
      contentType: "application/json",
    });
    expect(res.status).toBe(201);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("the body limit is 100 KB: at the limit it's validated, one byte over is a 413", async () => {
    const pad = (size: number) => {
      const base = JSON.stringify({ ...validPosting, description: "" });
      return base.replace('"description":""', `"description":"${"d".repeat(size - base.length)}"`);
    };
    const atLimit = pad(BODY_LIMIT_BYTES);
    expect(new TextEncoder().encode(atLimit).byteLength).toBe(BODY_LIMIT_BYTES);
    const ok = await api("/api/postings", {
      rawBody: atLimit,
      cookie: seller,
      contentType: "application/json",
    });
    // Not a 413: the request reached validation (the description is too long).
    await expectApiError(ok, 400, "validation_failed");

    const before = await dbSnapshot(db, ["postings"]);
    const over = await api("/api/postings", {
      rawBody: pad(BODY_LIMIT_BYTES + 1),
      cookie: seller,
      contentType: "application/json",
    });
    await expectApiError(over, 413, "payload_too_large");
    expect(await dbSnapshot(db, ["postings"])).toEqual(before);
  });

  it("a streamed (chunked) body over the limit is a 413 too", async () => {
    const chunk = new TextEncoder().encode("a".repeat(16 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > BODY_LIMIT_BYTES * 2) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const res = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "cf-connecting-ip": freshIp(),
      },
      body: stream,
    });
    await expectApiError(res, 413, "payload_too_large");
  });

  it("a big body is refused before the session or the handler runs", async () => {
    const before = await dbSnapshot(db);
    const res = await api("/api/auth/register", {
      rawBody: JSON.stringify({
        username: "big",
        password: GOOD_PASSWORD,
        turnstileToken: "x".repeat(BODY_LIMIT_BYTES),
      }),
      contentType: "application/json",
      ip: freshIp(),
    });
    await expectApiError(res, 413, "payload_too_large");
    expect(await dbSnapshot(db)).toEqual(before);
  });
});

describe("path ids", () => {
  it.each([
    "abc",
    "0",
    "-1",
    "+1",
    "1.0",
    "1e3",
    "0x1",
    "01",
    "%20%31",
    "1%00",
    "%EF%BC%91",
    "2147483648",
    "99999999999",
    "1;DROP",
  ])("%s is a 400 everywhere", async (id) => {
    await expectApiError(await api(`/api/postings/${id}`), 400, "validation_failed");
    await expectApiError(
      await api(`/api/postings/${id}`, { method: "PUT", body: validPosting, cookie: seller }),
      400,
      "validation_failed",
    );
    await expectApiError(
      await api(`/api/postings/${id}`, { method: "DELETE", cookie: seller }),
      400,
      "validation_failed",
    );
    await expectApiError(
      await api(`/api/me/saved/${id}`, { method: "PUT", cookie: seller }),
      400,
      "validation_failed",
    );
    await expectApiError(
      await api(`/api/me/saved/${id}`, { method: "DELETE", cookie: seller }),
      400,
      "validation_failed",
    );
  });

  it("2147483647 is valid (and missing)", async () => {
    await expectApiError(await api("/api/postings/2147483647"), 404, "not_found");
  });
});

describe("no CORS", () => {
  it("never sends Access-Control-* headers, even to a preflight", async () => {
    const preflight = await SELF.fetch(`${ORIGIN}/api/postings`, {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(preflight.status).toBeGreaterThanOrEqual(400);
    const read = await SELF.fetch(`${ORIGIN}/api/postings`, {
      headers: { origin: "https://evil.example" },
    });
    for (const res of [preflight, read]) {
      for (const [name] of res.headers) {
        expect(name.toLowerCase()).not.toMatch(/^access-control-/);
      }
    }
  });
});

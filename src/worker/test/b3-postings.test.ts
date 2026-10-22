// Q-B3: postings and saved listings (ported from legacy server/test/routes.test.js).
import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  PostingPage,
  PostingWithSeller,
  SavedListing,
  SavedPostingPage,
} from "../../shared/schemas";
import { api, mockOutbound, registerUser, validPosting } from "./helpers";

let alice: string;
let bob: string;

beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

beforeAll(async () => {
  const spy = mockOutbound();
  alice = (await registerUser("alice")).cookie;
  bob = (await registerUser("bob")).cookie;
  spy.mockRestore();
});

const create = async (cookie: string, overrides: Partial<typeof validPosting> = {}) => {
  const res = await api("/api/postings", { body: { ...validPosting, ...overrides }, cookie });
  expect(res.status).toBe(201);
  return PostingWithSeller.parse(await res.json());
};

describe("auth", () => {
  it("market reads are public", async () => {
    const posting = await create(alice);
    expect((await api("/api/postings")).status).toBe(200);
    expect((await api(`/api/postings/${posting.id}`)).status).toBe(200);
  });

  it("writes, /api/me and saved listings require a session", async () => {
    const posting = await create(alice);
    const calls: [string, string, unknown?][] = [
      ["POST", "/api/postings", validPosting],
      ["PUT", `/api/postings/${posting.id}`, validPosting],
      ["DELETE", `/api/postings/${posting.id}`],
      ["GET", "/api/me/postings"],
      ["GET", "/api/me/saved"],
      ["PUT", `/api/me/saved/${posting.id}`],
      ["DELETE", `/api/me/saved/${posting.id}`],
      ["DELETE", "/api/me", { password: "whatever" }],
    ];
    for (const [method, path, body] of calls) {
      const res = await api(path, { method, body });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(ApiError.parse(await res.json()).error.code).toBe("unauthorized");
    }
  });
});

describe("POST /api/postings", () => {
  it("returns 201 with the posting and the seller's username only", async () => {
    const posting = await create(alice, { title: "  Tofu60  " });
    expect(posting).toEqual({
      id: expect.any(Number),
      userId: expect.any(Number),
      title: "Tofu60",
      description: validPosting.description,
      imageUrl: validPosting.imageUrl,
      priceCents: 19999,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      sellerUsername: "alice",
    });
  });

  it("round-trips the price in cents (199.99 -> 19999)", async () => {
    const posting = await create(alice, { priceCents: 19999 });
    const fetched = PostingWithSeller.parse(
      await (await api(`/api/postings/${posting.id}`)).json(),
    );
    expect(fetched.priceCents).toBe(19999);
    const row = await env.DB.prepare("SELECT price_cents FROM postings WHERE id = ?")
      .bind(posting.id)
      .first();
    expect(row).toEqual({ price_cents: 19999 });
  });

  it("validates the body", async () => {
    for (const bad of [
      { title: "   " },
      { imageUrl: "javascript:alert(1)" },
      { imageUrl: "http://example.com/a.jpg" },
      { priceCents: -1 },
      { priceCents: 1e20 },
      { priceCents: 1.5 },
      { priceCents: "199.99" },
      { title: "t".repeat(201) },
    ]) {
      const res = await api("/api/postings", { body: { ...validPosting, ...bad }, cookie: alice });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});

describe("GET /api/postings/:id", () => {
  it("rejects malformed ids with 400", async () => {
    for (const id of ["abc", "0", "-1", "1.5", "99999999999"]) {
      const res = await api(`/api/postings/${id}`);
      expect(res.status, id).toBe(400);
    }
  });

  it("returns 404 for a missing posting", async () => {
    const res = await api("/api/postings/2147483647");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error.code).toBe("not_found");
  });
});

describe("PUT /api/postings/:id", () => {
  it("lets the owner update and returns 200 with the posting", async () => {
    const posting = await create(alice);
    const res = await api(`/api/postings/${posting.id}`, {
      method: "PUT",
      body: { ...validPosting, title: "GMMK Pro v2", priceCents: 15000 },
      cookie: alice,
    });
    expect(res.status).toBe(200);
    const updated = PostingWithSeller.parse(await res.json());
    expect(updated.title).toBe("GMMK Pro v2");
    expect(updated.priceCents).toBe(15000);
    expect(updated.createdAt).toBe(posting.createdAt);
  });

  it("returns 404 to anyone but the owner", async () => {
    const posting = await create(alice);
    const res = await api(`/api/postings/${posting.id}`, {
      method: "PUT",
      body: { ...validPosting, title: "Mine now" },
      cookie: bob,
    });
    expect(res.status).toBe(404);
    const row = await env.DB.prepare("SELECT title FROM postings WHERE id = ?")
      .bind(posting.id)
      .first();
    expect(row).toEqual({ title: validPosting.title });
  });

  it("validates the id and body", async () => {
    const posting = await create(alice);
    expect(
      (await api("/api/postings/abc", { method: "PUT", body: validPosting, cookie: alice })).status,
    ).toBe(400);
    expect(
      (await api("/api/postings/0", { method: "PUT", body: validPosting, cookie: alice })).status,
    ).toBe(400);
    expect(
      (
        await api(`/api/postings/${posting.id}`, {
          method: "PUT",
          body: { ...validPosting, priceCents: -5 },
          cookie: alice,
        })
      ).status,
    ).toBe(400);
  });
});

describe("DELETE /api/postings/:id", () => {
  it("is owner-only: 404 for others, 204 for the owner, then 404", async () => {
    const posting = await create(alice);
    expect(
      (await api(`/api/postings/${posting.id}`, { method: "DELETE", cookie: bob })).status,
    ).toBe(404);
    expect(
      (await api(`/api/postings/${posting.id}`, { method: "DELETE", cookie: alice })).status,
    ).toBe(204);
    expect(
      (await api(`/api/postings/${posting.id}`, { method: "DELETE", cookie: alice })).status,
    ).toBe(404);
  });

  it("removes the posting from everyone's saved listings (cascade)", async () => {
    const posting = await create(alice);
    expect((await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie: bob })).status).toBe(
      201,
    );
    await api(`/api/postings/${posting.id}`, { method: "DELETE", cookie: alice });
    const saved = await env.DB.prepare(
      "SELECT count(*) AS n FROM saved_listings WHERE posting_id = ?",
    )
      .bind(posting.id)
      .first();
    expect(saved).toEqual({ n: 0 });
  });
});

describe("paging", () => {
  it("lists newest first with an opaque nextCursor", async () => {
    const { cookie } = await registerUser("pager");
    const titles = ["P1", "P2", "P3", "P4", "P5"];
    for (const title of titles) {
      await create(cookie, { title });
    }
    const first = PostingPage.parse(
      await (await api("/api/me/postings?limit=2", { cookie })).json(),
    );
    expect(first.items.map((p) => p.title)).toEqual(["P5", "P4"]);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    const second = PostingPage.parse(
      await (await api(`/api/me/postings?limit=2&cursor=${first.nextCursor}`, { cookie })).json(),
    );
    expect(second.items.map((p) => p.title)).toEqual(["P3", "P2"]);

    const third = PostingPage.parse(
      await (await api(`/api/me/postings?limit=2&cursor=${second.nextCursor}`, { cookie })).json(),
    );
    expect(third.items.map((p) => p.title)).toEqual(["P1"]);
    expect(third.nextCursor).toBeNull();
  });

  it("market feed pages the same way and includes everyone's postings", async () => {
    const page = PostingPage.parse(await (await api("/api/postings?limit=100")).json());
    const ids = page.items.map((p) => p.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    expect(new Set(page.items.map((p) => p.sellerUsername)).size).toBeGreaterThan(1);
  });

  it("clamps the limit and rejects bad limits and cursors", async () => {
    expect((await api("/api/postings?limit=100000")).status).toBe(200);
    expect((await api("/api/postings?limit=0")).status).toBe(200);
    expect((await api("/api/postings?limit=abc")).status).toBe(400);
    expect((await api("/api/postings?cursor=bm9wZQ")).status).toBe(400);
    expect((await api("/api/postings?cursor=not%20valid")).status).toBe(400);
    expect((await api("/api/me/saved?cursor=cDE", { cookie: alice })).status).toBe(400);
  });

  it("defaults to 20 items", async () => {
    const { cookie } = await registerUser("bulk");
    for (let i = 0; i < 22; i += 1) {
      await create(cookie, { title: `Bulk ${i}` });
    }
    const page = PostingPage.parse(await (await api("/api/me/postings", { cookie })).json());
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
  });
});

describe("GET /api/me/postings", () => {
  it("returns only the user's postings", async () => {
    const page = PostingPage.parse(
      await (await api("/api/me/postings?limit=100", { cookie: bob })).json(),
    );
    expect(page.items.every((p) => p.sellerUsername === "bob")).toBe(true);
  });
});

describe("saved listings", () => {
  it("are idempotent: 201, then 200, and listed once", async () => {
    const { cookie } = await registerUser("saver");
    const posting = await create(alice);
    const first = await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie });
    expect(first.status).toBe(201);
    const saved = SavedListing.parse(await first.json());
    expect(saved.postingId).toBe(posting.id);
    const again = await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie });
    expect(again.status).toBe(200);
    expect(SavedListing.parse(await again.json())).toEqual(saved);

    const list = SavedPostingPage.parse(await (await api("/api/me/saved", { cookie })).json());
    expect(list.items.map((p) => p.id)).toEqual([posting.id]);
    expect(list.items[0]?.sellerUsername).toBe("alice");
    expect(list.items[0]?.savedAt).toBe(saved.savedAt);
  });

  it("are scoped to the user", async () => {
    const { cookie: carol } = await registerUser("carol");
    const { cookie: dave } = await registerUser("dave");
    const posting = await create(alice);
    await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie: carol });
    expect(
      SavedPostingPage.parse(await (await api("/api/me/saved", { cookie: dave })).json()).items,
    ).toEqual([]);
    expect(
      (await api(`/api/me/saved/${posting.id}`, { method: "DELETE", cookie: dave })).status,
    ).toBe(404);
    expect(
      SavedPostingPage.parse(await (await api("/api/me/saved", { cookie: carol })).json()).items,
    ).toHaveLength(1);
  });

  it("returns 404 for a missing posting and for unsaving one that isn't saved", async () => {
    expect((await api("/api/me/saved/2147483647", { method: "PUT", cookie: alice })).status).toBe(
      404,
    );
    expect(
      (await api("/api/me/saved/2147483647", { method: "DELETE", cookie: alice })).status,
    ).toBe(404);
    expect((await api("/api/me/saved/abc", { method: "PUT", cookie: alice })).status).toBe(400);
  });

  it("unsave returns 204 and removes it", async () => {
    const { cookie } = await registerUser("unsaver");
    const posting = await create(alice);
    await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie });
    expect((await api(`/api/me/saved/${posting.id}`, { method: "DELETE", cookie })).status).toBe(
      204,
    );
    expect(
      SavedPostingPage.parse(await (await api("/api/me/saved", { cookie })).json()).items,
    ).toEqual([]);
  });

  it("page by save time", async () => {
    const { cookie } = await registerUser("savepager");
    const postings = [
      await create(alice, { title: "S1" }),
      await create(alice, { title: "S2" }),
      await create(alice, { title: "S3" }),
    ];
    for (const posting of postings) {
      await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie });
    }
    const first = SavedPostingPage.parse(
      await (await api("/api/me/saved?limit=2", { cookie })).json(),
    );
    expect(first.items.map((p) => p.title)).toEqual(["S3", "S2"]);
    const second = SavedPostingPage.parse(
      await (await api(`/api/me/saved?limit=2&cursor=${first.nextCursor}`, { cookie })).json(),
    );
    expect(second.items.map((p) => p.title)).toEqual(["S1"]);
    expect(second.nextCursor).toBeNull();
  });
});

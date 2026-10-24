// QA: keyset paging under tampering, limit clamping, and data integrity
// (cascades on account and posting delete, id reuse, price round-trip).
import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_SIZE_MAX } from "../../shared/limits";
import { PostingPage, PostingWithSeller, SavedIds, SavedPostingPage } from "../../shared/schemas";
import {
  api,
  expectApiError,
  GOOD_PASSWORD,
  loginUser,
  mockOutbound,
  registerUser,
  validPosting,
} from "./helpers";

const db = env.DB;
let alice: string;
let bob: string;
const b64url = (value: string) =>
  btoa(value).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const create = async (cookie: string, title: string) => {
  const res = await api("/api/postings", { body: { ...validPosting, title }, cookie });
  expect(res.status).toBe(201);
  return PostingWithSeller.parse(await res.json());
};

beforeAll(async () => {
  const spy = mockOutbound();
  alice = (await registerUser("page-alice")).cookie;
  bob = (await registerUser("page-bob")).cookie;
  for (let i = 1; i <= 7; i += 1) {
    await create(alice, `A${i}`);
    await create(bob, `B${i}`);
  }
  spy.mockRestore();
});
beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

/** Walks every page of `path` and returns all item ids. */
async function walk(
  path: string,
  cookie: string | null,
  limit: number,
  start: string | null = null,
) {
  const ids: number[] = [];
  let cursor: string | null = start;
  for (let pages = 0; pages < 1000; pages += 1) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await api(url, { cookie });
    expect(res.status, url).toBe(200);
    const page = PostingPage.parse(await res.json());
    expect(page.items.length).toBeLessThanOrEqual(limit);
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
    if (!cursor) {
      return ids;
    }
  }
  throw new Error("paging never ended");
}

describe("cursor tampering", () => {
  it.each([
    ["not base64url", "!!!"],
    ["padding", "cDE="],
    ["empty after decoding", "AA"],
    ["no prefix", b64url("12")],
    ["wrong prefix", b64url("x12")],
    ["zero", b64url("p0")],
    ["negative", b64url("p-1")],
    ["decimal", b64url("p1.5")],
    ["exponent", b64url("p1e3")],
    ["leading zero", b64url("p01")],
    ["space", b64url("p 1")],
    ["17 digits", b64url(`p${"9".repeat(17)}`)],
    ["SQL", b64url("p1 OR 1=1")],
    ["saved-list cursor on the market", b64url("s1700000000_5")],
    ["201 characters", "A".repeat(201)],
    ["unicode", "pé"],
  ])("%s is a 400 with a cursor field error", async (_label, cursor) => {
    const res = await api(`/api/postings?cursor=${encodeURIComponent(cursor)}`);
    const body = await expectApiError(res, 400, "validation_failed");
    expect(body.error.fields?.cursor).toBeDefined();
    const mine = await api(`/api/me/postings?cursor=${encodeURIComponent(cursor)}`, {
      cookie: alice,
    });
    await expectApiError(mine, 400, "validation_failed");
  });

  it.each([
    ["market cursor on saved", b64url("p5")],
    ["savedAt too long", b64url("s1234567890123_5")],
    ["posting id 0", b64url("s1700000000_0")],
    ["missing id", b64url("s1700000000_")],
    ["negative time", b64url("s-1_5")],
  ])("saved list: %s is a 400", async (_label, cursor) => {
    await expectApiError(
      await api(`/api/me/saved?cursor=${cursor}`, { cookie: alice }),
      400,
      "validation_failed",
    );
  });

  it("a hand-made but well-formed cursor just moves the window (no error, no leak)", async () => {
    const all = await walk("/api/postings", null, 100);
    const pivot = all[3] ?? 1;
    const res = await api(`/api/postings?limit=100&cursor=${b64url(`p${pivot}`)}`);
    const page = PostingPage.parse(await res.json());
    expect(page.items.map((p) => p.id)).toEqual(all.filter((id) => id < pivot));
    const huge = PostingPage.parse(
      await (await api(`/api/postings?limit=100&cursor=${b64url(`p${"9".repeat(16)}`)}`)).json(),
    );
    expect(huge.items.map((p) => p.id)).toEqual(all.slice(0, 100));
  });

  it("someone else's cursor only pages through your own list", async () => {
    const alicePage = PostingPage.parse(
      await (await api("/api/me/postings?limit=2", { cookie: alice })).json(),
    );
    expect(alicePage.nextCursor).not.toBeNull();
    const asBob = PostingPage.parse(
      await (
        await api(`/api/me/postings?limit=100&cursor=${alicePage.nextCursor}`, { cookie: bob })
      ).json(),
    );
    expect(asBob.items.every((p) => p.sellerUsername === "page-bob")).toBe(true);

    for (const posting of (
      (await (await api("/api/postings?limit=100")).json()) as { items: { id: number }[] }
    ).items.slice(0, 3)) {
      await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie: alice });
    }
    const aliceSaved = SavedPostingPage.parse(
      await (await api("/api/me/saved?limit=1", { cookie: alice })).json(),
    );
    expect(aliceSaved.nextCursor).not.toBeNull();
    const bobSaved = SavedPostingPage.parse(
      await (
        await api(`/api/me/saved?limit=100&cursor=${aliceSaved.nextCursor}`, { cookie: bob })
      ).json(),
    );
    expect(bobSaved.items).toEqual([]);
  });
});

describe("limit", () => {
  it.each([
    ["0", 1],
    ["1", 1],
    ["01", 1],
    ["100", PAGE_SIZE_MAX],
    ["101", PAGE_SIZE_MAX],
    ["999999999", PAGE_SIZE_MAX],
  ])("limit=%s returns at most %i items", async (limit, max) => {
    const page = PostingPage.parse(await (await api(`/api/postings?limit=${limit}`)).json());
    expect(page.items.length).toBe(Math.min(max, 14));
  });

  it.each(["-1", "1.5", "1e2", "0x10", "+5", "", " 5", "abc", "1000000000"])(
    "limit=%j is a 400",
    async (limit) => {
      const res = await api(`/api/postings?limit=${encodeURIComponent(limit)}`);
      const body = await expectApiError(res, 400, "validation_failed");
      expect(body.error.fields?.limit).toBeDefined();
    },
  );

  it("a repeated query parameter is a 400, not a guess", async () => {
    await expectApiError(await api("/api/postings?limit=1&limit=2"), 400, "validation_failed");
  });
});

describe("paging consistency", () => {
  it("walking every page at any size returns each posting exactly once, newest first", async () => {
    const reference = await walk("/api/postings", null, 100);
    expect(reference.length).toBeGreaterThanOrEqual(14);
    expect([...reference].sort((a, b) => b - a)).toEqual(reference);
    for (const size of [1, 2, 3, 5, 13]) {
      expect(await walk("/api/postings", null, size)).toEqual(reference);
    }
  });

  it("new postings and deletions between pages cause no duplicates or skips of older items", async () => {
    const { cookie } = await registerUser("churn");
    const first = PostingPage.parse(await (await api("/api/postings?limit=4")).json());
    const firstIds = first.items.map((p) => p.id);
    // Meanwhile: a new posting arrives and one on the next page is deleted.
    await create(cookie, "brand new");
    const reference = await walk("/api/postings", null, 100);
    const victim = reference[reference.indexOf(firstIds.at(-1) ?? 0) + 1];
    const victimOwner = victim
      ? PostingWithSeller.parse(await (await api(`/api/postings/${victim}`)).json())
      : null;
    const ownerCookie = victimOwner?.sellerUsername === "page-alice" ? alice : bob;
    expect(
      (await api(`/api/postings/${victim}`, { method: "DELETE", cookie: ownerCookie })).status,
    ).toBe(204);

    const lastSeen = firstIds.at(-1) ?? 0;
    const rest = await walk("/api/postings", null, 4, first.nextCursor);
    // Exactly the older items that still exist: the new posting isn't
    // repeated, nothing from page one comes back, and the deleted one is gone.
    expect(rest).toEqual(reference.filter((id) => id < lastSeen && id !== victim));
  });

  it("saved listings saved in the same second page by posting id with no duplicates", async () => {
    const { cookie, user } = await registerUser("same-second");
    const ids = (await walk("/api/postings", null, 100)).slice(0, 6);
    for (const id of ids) {
      expect((await api(`/api/me/saved/${id}`, { method: "PUT", cookie })).status).toBe(201);
    }
    await db
      .prepare("UPDATE saved_listings SET created_at = 1700000000 WHERE user_id = ?")
      .bind(user.id)
      .run();
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const url = `/api/me/saved?limit=4${cursor ? `&cursor=${cursor}` : ""}`;
      const page = SavedPostingPage.parse(await (await api(url, { cookie })).json());
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual([...ids].sort((a, b) => b - a));
    const all = SavedIds.parse(await (await api("/api/me/saved/ids", { cookie })).json());
    expect(all.ids).toEqual(seen);
  });
});

describe("data integrity", () => {
  it("deleting an account removes its postings from everyone's saved lists and keeps everything else", async () => {
    const leaver = await registerUser("cascade-leaver");
    const stayer = await registerUser("cascade-stayer");
    const leaverPosting = await create(leaver.cookie, "leaving soon");
    const stayerPosting = await create(stayer.cookie, "staying");
    await api(`/api/me/saved/${leaverPosting.id}`, { method: "PUT", cookie: stayer.cookie });
    await api(`/api/me/saved/${stayerPosting.id}`, { method: "PUT", cookie: stayer.cookie });
    await api(`/api/me/saved/${stayerPosting.id}`, { method: "PUT", cookie: leaver.cookie });
    await api(`/api/me/saved/${leaverPosting.id}`, { method: "PUT", cookie: alice });

    const res = await api("/api/me", {
      method: "DELETE",
      body: { password: GOOD_PASSWORD },
      cookie: leaver.cookie,
    });
    expect(res.status).toBe(204);

    const stayerIds = SavedIds.parse(
      await (await api("/api/me/saved/ids", { cookie: stayer.cookie })).json(),
    );
    expect(stayerIds.ids).toEqual([stayerPosting.id]);
    const aliceIds = SavedIds.parse(
      await (await api("/api/me/saved/ids", { cookie: alice })).json(),
    );
    expect(aliceIds.ids).not.toContain(leaverPosting.id);
    await expectApiError(await api(`/api/postings/${leaverPosting.id}`), 404, "not_found");
    expect((await api(`/api/postings/${stayerPosting.id}`)).status).toBe(200);
    const market = await walk("/api/postings", null, 100);
    expect(market).not.toContain(leaverPosting.id);
    const orphans = await db
      .prepare(
        `SELECT
          (SELECT count(*) FROM postings WHERE user_id NOT IN (SELECT id FROM users)) AS postings,
          (SELECT count(*) FROM saved_listings WHERE user_id NOT IN (SELECT id FROM users)
              OR posting_id NOT IN (SELECT id FROM postings)) AS saved,
          (SELECT count(*) FROM sessions WHERE user_id NOT IN (SELECT id FROM users)) AS sessions`,
      )
      .first();
    expect(orphans).toEqual({ postings: 0, saved: 0, sessions: 0 });
    const fk = await db.prepare("PRAGMA foreign_key_check").all();
    expect(fk.results).toEqual([]);
  });

  it("a re-registered name starts clean, even if SQLite reuses the deleted user's id", async () => {
    const first = await registerUser("reborn");
    const posting = await create(first.cookie, "old life");
    await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie: first.cookie });
    expect(
      (
        await api("/api/me", {
          method: "DELETE",
          body: { password: GOOD_PASSWORD },
          cookie: first.cookie,
        })
      ).status,
    ).toBe(204);

    const second = await registerUser("reborn", "another fake phrase");
    expect((await api("/api/auth/me", { cookie: first.cookie })).status).toBe(401);
    const mine = PostingPage.parse(
      await (await api("/api/me/postings", { cookie: second.cookie })).json(),
    );
    expect(mine.items).toEqual([]);
    const saved = SavedIds.parse(
      await (await api("/api/me/saved/ids", { cookie: second.cookie })).json(),
    );
    expect(saved.ids).toEqual([]);
    expect((await loginUser("reborn", GOOD_PASSWORD)).status).toBe(401);
  });

  it("deleting a posting removes it from saved lists but keeps the savers' other rows", async () => {
    const p1 = await create(alice, "doomed");
    const p2 = await create(alice, "kept");
    await api(`/api/me/saved/${p1.id}`, { method: "PUT", cookie: bob });
    await api(`/api/me/saved/${p2.id}`, { method: "PUT", cookie: bob });
    expect((await api(`/api/postings/${p1.id}`, { method: "DELETE", cookie: alice })).status).toBe(
      204,
    );
    const ids = SavedIds.parse(await (await api("/api/me/saved/ids", { cookie: bob })).json());
    expect(ids.ids).toContain(p2.id);
    expect(ids.ids).not.toContain(p1.id);
    await expectApiError(
      await api(`/api/me/saved/${p1.id}`, { method: "PUT", cookie: bob }),
      404,
      "not_found",
    );
  });

  it("an edit keeps createdAt and moves updatedAt", async () => {
    const posting = await create(alice, "timestamps");
    await db
      .prepare(
        "UPDATE postings SET created_at = created_at - 100, updated_at = updated_at - 100 WHERE id = ?",
      )
      .bind(posting.id)
      .run();
    const before = PostingWithSeller.parse(await (await api(`/api/postings/${posting.id}`)).json());
    const after = PostingWithSeller.parse(
      await (
        await api(`/api/postings/${posting.id}`, {
          method: "PUT",
          body: { ...validPosting, title: "edited" },
          cookie: alice,
        })
      ).json(),
    );
    expect(after.createdAt).toBe(before.createdAt);
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
    expect(after.id).toBe(posting.id);
  });
});

// QA: authorization and IDOR. Every write and every /api/me/* route, called
// as a guest, with dead sessions of every kind, and as another user. A
// refused call must answer with the JSON error shape and change nothing in D1.
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostingPage, PostingWithSeller, SavedIds, SavedPostingPage } from "../../shared/schemas";
import { SESSION_ABSOLUTE_SECONDS } from "../auth/session";
import { nowSeconds } from "../lib/time";
import {
  api,
  dbSnapshot,
  expectApiError,
  freshIp,
  GOOD_PASSWORD,
  loginUser,
  mockOutbound,
  registerUser,
  sessionCookie,
  sessionIdFrom,
  validPosting,
} from "./helpers";

const db = env.DB;
const NEW_PASSWORD = "different fake words";

beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

type Call = { method: string; path: string; body?: unknown };

/** Every route that needs a session, with a body that would otherwise succeed. */
const protectedCalls = (postingId: number): Call[] => [
  { method: "GET", path: "/api/auth/me" },
  {
    method: "POST",
    path: "/api/auth/password",
    body: { currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD },
  },
  { method: "POST", path: "/api/postings", body: validPosting },
  {
    method: "PUT",
    path: `/api/postings/${postingId}`,
    body: { ...validPosting, title: "hijacked" },
  },
  { method: "DELETE", path: `/api/postings/${postingId}` },
  { method: "GET", path: "/api/me/postings" },
  { method: "GET", path: "/api/me/saved" },
  { method: "GET", path: "/api/me/saved/ids" },
  { method: "PUT", path: `/api/me/saved/${postingId}` },
  { method: "DELETE", path: `/api/me/saved/${postingId}` },
  { method: "DELETE", path: "/api/me", body: { password: GOOD_PASSWORD } },
];

const create = async (cookie: string, overrides: Partial<typeof validPosting> = {}) => {
  const res = await api("/api/postings", { body: { ...validPosting, ...overrides }, cookie });
  expect(res.status).toBe(201);
  return PostingWithSeller.parse(await res.json());
};

/** A signed-in user with one posting that they have also saved. */
async function owner(name: string) {
  const { cookie, user } = await registerUser(name);
  const posting = await create(cookie, { title: `${name}'s board` });
  expect((await api(`/api/me/saved/${posting.id}`, { method: "PUT", cookie })).status).toBe(201);
  return { cookie, user, posting };
}

/** Calls every protected route with `cookie` and expects a 401 that changes nothing. */
async function expectAllRefused(cookie: string | null, postingId: number, label: string) {
  // Dead sessions are deleted when they're first seen, so leave sessions out.
  const before = await dbSnapshot(db, ["users", "postings", "saved_listings"]);
  for (const call of protectedCalls(postingId)) {
    // A fresh IP each time, so the per-IP auth rate limiter never answers first.
    const res = await api(call.path, {
      method: call.method,
      body: call.body,
      cookie,
      ip: freshIp(),
    });
    await expectApiError(res, 401, "unauthorized");
    expect(res.headers.get("cache-control"), `${label} ${call.method} ${call.path}`).toBe(
      "no-store",
    );
  }
  expect(await dbSnapshot(db, ["users", "postings", "saved_listings"])).toEqual(before);
}

describe("every protected route refuses a missing or dead session with 401", () => {
  it("as a guest (no cookie)", async () => {
    const { posting } = await owner("authz-guest");
    await expectAllRefused(null, posting.id, "guest");
  });

  it("with a malformed, unknown or forged token", async () => {
    const { posting, cookie } = await owner("authz-forged");
    const id = sessionIdFrom(cookie);
    for (const token of [
      "garbage",
      "",
      `${id}`,
      `${id}.`,
      `${id.toUpperCase()}.${"a".repeat(24)}`,
      `${"a".repeat(24)}.${"a".repeat(24)}`,
      `${id}.${"b".repeat(24)}`,
      `${id}.${"a".repeat(24)}.extra`,
      `${id}.${"a".repeat(4000)}`,
    ]) {
      await expectAllRefused(`__Host-keebhub_session=${token}`, posting.id, token.slice(0, 40));
    }
  });

  it("after logout (revoked)", async () => {
    const { posting, cookie } = await owner("authz-loggedout");
    expect((await api("/api/auth/logout", { method: "POST", cookie })).status).toBe(204);
    await expectAllRefused(cookie, posting.id, "revoked");
  });

  it("past the 7-day idle expiry", async () => {
    const { posting, cookie } = await owner("authz-idle");
    await db
      .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(nowSeconds() - 1, sessionIdFrom(cookie))
      .run();
    await expectAllRefused(cookie, posting.id, "idle-expired");
  });

  it("past the 30-day absolute cap, even with a later idle expiry", async () => {
    const { posting, cookie } = await owner("authz-absolute");
    const now = nowSeconds();
    await db
      .prepare("UPDATE sessions SET created_at = ?, expires_at = ? WHERE id = ?")
      .bind(now - SESSION_ABSOLUTE_SECONDS, now + 3600, sessionIdFrom(cookie))
      .run();
    await expectAllRefused(cookie, posting.id, "absolute-expired");
  });

  it("on another device after a password change", async () => {
    const { posting, cookie } = await owner("authz-pwchange");
    const otherDevice = sessionCookie(await loginUser("authz-pwchange"));
    expect(otherDevice).not.toBeNull();
    const change = await api("/api/auth/password", {
      body: { currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD },
      cookie,
    });
    expect(change.status).toBe(204);
    await expectAllRefused(otherDevice, posting.id, "revoked-by-password-change");
    // The device that changed it is still signed in.
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
  });

  it("after the account is deleted (every device)", async () => {
    const { cookie: bystander } = await registerUser("authz-bystander");
    const survivor = await create(bystander, { title: "still here" });
    const { cookie } = await registerUser("authz-deleted");
    const otherDevice = sessionCookie(await loginUser("authz-deleted"));
    const res = await api("/api/me", {
      method: "DELETE",
      body: { password: GOOD_PASSWORD },
      cookie,
    });
    expect(res.status).toBe(204);
    await expectAllRefused(cookie, survivor.id, "deleted-account");
    await expectAllRefused(otherDevice, survivor.id, "deleted-account-other-device");
  });
});

describe("another user's data (IDOR)", () => {
  it("can't be changed or deleted, and the 404 doesn't reveal that it exists", async () => {
    const alice = await owner("idor-alice");
    const { cookie: bob } = await registerUser("idor-bob");
    const before = await dbSnapshot(db, ["postings", "saved_listings"]);

    const put = await api(`/api/postings/${alice.posting.id}`, {
      method: "PUT",
      body: { ...validPosting, title: "pwned" },
      cookie: bob,
    });
    const putBody = await expectApiError(put, 404, "not_found");
    const del = await api(`/api/postings/${alice.posting.id}`, { method: "DELETE", cookie: bob });
    const delBody = await expectApiError(del, 404, "not_found");

    // Byte-for-byte the same as for a posting that doesn't exist.
    const missingPut = await api("/api/postings/2147483647", {
      method: "PUT",
      body: validPosting,
      cookie: bob,
    });
    expect(await missingPut.json()).toEqual(putBody);
    const missingDel = await api("/api/postings/2147483647", { method: "DELETE", cookie: bob });
    expect(await missingDel.json()).toEqual(delBody);

    // Bob unsaving Alice's saved listing only touches Bob's (empty) list.
    await expectApiError(
      await api(`/api/me/saved/${alice.posting.id}`, { method: "DELETE", cookie: bob }),
      404,
      "not_found",
    );
    expect(await dbSnapshot(db, ["postings", "saved_listings"])).toEqual(before);
  });

  it("isn't listed in someone else's /api/me lists", async () => {
    const alice = await owner("lists-alice");
    const { cookie: bob } = await registerUser("lists-bob");
    const bobsOwn = await create(bob, { title: "bob's own" });

    const postings = PostingPage.parse(
      await (await api("/api/me/postings?limit=100", { cookie: bob })).json(),
    );
    expect(postings.items.map((p) => p.id)).toEqual([bobsOwn.id]);
    const saved = SavedPostingPage.parse(
      await (await api("/api/me/saved?limit=100", { cookie: bob })).json(),
    );
    expect(saved.items).toEqual([]);
    const ids = SavedIds.parse(await (await api("/api/me/saved/ids", { cookie: bob })).json());
    expect(ids.ids).toEqual([]);

    // Saving Alice's posting creates Bob's row only; Alice's stays as it was.
    expect(
      (await api(`/api/me/saved/${alice.posting.id}`, { method: "PUT", cookie: bob })).status,
    ).toBe(201);
    const rows = await db
      .prepare("SELECT user_id FROM saved_listings WHERE posting_id = ? ORDER BY user_id")
      .bind(alice.posting.id)
      .all<{ user_id: number }>();
    expect(rows.results.map((r) => r.user_id)).toHaveLength(2);
    const aliceIds = SavedIds.parse(
      await (await api("/api/me/saved/ids", { cookie: alice.cookie })).json(),
    );
    expect(aliceIds.ids).toEqual([alice.posting.id]);
  });

  it("ignores ownership fields in the body (no mass assignment)", async () => {
    const alice = await owner("mass-alice");
    const { cookie: bob, user: bobUser } = await registerUser("mass-bob");
    const sneaky = {
      ...validPosting,
      id: alice.posting.id,
      userId: alice.user.id,
      user_id: alice.user.id,
      sellerUsername: "mass-alice",
      createdAt: "2000-01-01T00:00:00.000Z",
    };
    const created = await api("/api/postings", { body: sneaky, cookie: bob });
    expect(created.status).toBe(201);
    const posting = PostingWithSeller.parse(await created.json());
    expect(posting.id).not.toBe(alice.posting.id);
    expect(posting.userId).toBe(bobUser.id);
    expect(posting.sellerUsername).toBe("mass-bob");
    expect(posting.createdAt).not.toBe(sneaky.createdAt);

    const updated = await api(`/api/postings/${posting.id}`, {
      method: "PUT",
      body: sneaky,
      cookie: bob,
    });
    expect(updated.status).toBe(200);
    expect(PostingWithSeller.parse(await updated.json()).userId).toBe(bobUser.id);
    const alices = PostingWithSeller.parse(
      await (await api(`/api/postings/${alice.posting.id}`)).json(),
    );
    expect(alices).toEqual(alice.posting);
  });

  it("can't be reached with someone else's password", async () => {
    const alice = await registerUser("pw-alice", "alice fake words");
    const { cookie: bob } = await registerUser("pw-bob");
    // Bob confirming with Alice's password is just a wrong password for Bob.
    const del = await api("/api/me", {
      method: "DELETE",
      body: { password: "alice fake words" },
      cookie: bob,
    });
    await expectApiError(del, 400, "validation_failed");
    const change = await api("/api/auth/password", {
      body: { currentPassword: "alice fake words", newPassword: NEW_PASSWORD },
      cookie: bob,
    });
    await expectApiError(change, 400, "validation_failed");
    expect((await api("/api/auth/me", { cookie: alice.cookie })).status).toBe(200);
    expect((await api("/api/auth/me", { cookie: bob })).status).toBe(200);
    expect((await loginUser("pw-alice", "alice fake words")).status).toBe(200);
  });
});

describe("public reads", () => {
  it("are open to guests and expose only the seller's id and username", async () => {
    const { posting } = await owner("public-seller");
    const one = await api(`/api/postings/${posting.id}`);
    expect(one.status).toBe(200);
    expect(Object.keys(await one.json()).sort()).toEqual(
      [
        "createdAt",
        "description",
        "id",
        "imageUrl",
        "priceCents",
        "sellerUsername",
        "title",
        "updatedAt",
        "userId",
      ].sort(),
    );
    const list = await api("/api/postings");
    expect(list.status).toBe(200);
    expect(await list.text()).not.toMatch(/password|pbkdf2|secret_hash/i);
  });
});

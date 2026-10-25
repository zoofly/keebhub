// Listing limits: 50 active listings per user, 20 creates per rolling hour.
import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LISTINGS_ACTIVE_MAX,
  LISTINGS_CREATED_PER_HOUR_MAX,
  LISTINGS_RATE_WINDOW_SECONDS,
} from "../../shared/limits";
import { ErrorCode } from "../../shared/schemas";
import worker from "../index";
import { nowSeconds } from "../lib/time";
import {
  api,
  dbSnapshot,
  expectApiError,
  mockOutbound,
  registerUser,
  seedListings,
  validPosting,
} from "./helpers";

const db = env.DB;

beforeEach(() => {
  mockOutbound();
});
afterEach(() => vi.restoreAllMocks());

const post = (cookie: string, title = "Limit test board") =>
  api("/api/postings", { body: { ...validPosting, title }, cookie });

/** Logs `count` creates for the user, `ageSeconds` ago. */
async function seedCreates(userId: number, count: number, ageSeconds = 60) {
  for (let i = 0; i < count; i += 1) {
    await db
      .prepare("INSERT INTO posting_creates (user_id, created_at) VALUES (?, ?)")
      .bind(userId, nowSeconds() - ageSeconds)
      .run();
  }
}

describe("listing limits", () => {
  it("are 50 active and 20 an hour, with listing_limit in the shared error codes", () => {
    expect(LISTINGS_ACTIVE_MAX).toBe(50);
    expect(LISTINGS_CREATED_PER_HOUR_MAX).toBe(20);
    expect(LISTINGS_RATE_WINDOW_SECONDS).toBe(3600);
    expect(ErrorCode.options).toContain("listing_limit");
    expect(ErrorCode.options.indexOf("listing_limit")).toBe(
      ErrorCode.options.indexOf("rate_limited") + 1,
    );
  });

  it("the 51st active listing is refused with 429 listing_limit, and nothing is written", async () => {
    const { cookie, user } = await registerUser("full-shop");
    const ids = await seedListings(db, user.id, LISTINGS_ACTIVE_MAX);
    const before = await dbSnapshot(db);
    const res = await post(cookie);
    const body = await expectApiError(res, 429, "listing_limit");
    expect(body.error.message).toBe(
      "You can have up to 50 active listings. Delete one to post another.",
    );
    expect(res.headers.get("retry-after")).toBeNull();
    expect(await dbSnapshot(db)).toEqual(before);

    // Deleting one makes room.
    expect((await api(`/api/postings/${ids[0]}`, { method: "DELETE", cookie })).status).toBe(204);
    expect((await post(cookie)).status).toBe(201);
    await expectApiError(await post(cookie), 429, "listing_limit");
  });

  it("the 21st create in an hour is refused with Retry-After and the wait in minutes", async () => {
    const { cookie } = await registerUser("fast-poster");
    for (let i = 0; i < LISTINGS_CREATED_PER_HOUR_MAX; i += 1) {
      expect((await post(cookie, `Quick ${i}`)).status, `create ${i + 1}`).toBe(201);
    }
    const before = await dbSnapshot(db);
    const res = await post(cookie);
    const body = await expectApiError(res, 429, "listing_limit");
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(LISTINGS_RATE_WINDOW_SECONDS - 30);
    expect(retryAfter).toBeLessThanOrEqual(LISTINGS_RATE_WINDOW_SECONDS);
    expect(body.error.message).toBe(
      `You can post up to 20 listings an hour. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
    );
    expect(await dbSnapshot(db)).toEqual(before);
  });

  it("deleting listings doesn't give creates back", async () => {
    const { cookie, user } = await registerUser("churner");
    await seedCreates(user.id, LISTINGS_CREATED_PER_HOUR_MAX - 1);
    const created = await post(cookie);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: number };
    expect((await api(`/api/postings/${id}`, { method: "DELETE", cookie })).status).toBe(204);
    await expectApiError(await post(cookie), 429, "listing_limit");
  });

  it("is a rolling hour: the wait counts from the oldest create in the window", async () => {
    const { cookie, user } = await registerUser("rolling");
    await seedCreates(user.id, 1, LISTINGS_RATE_WINDOW_SECONDS - 120); // leaves the window in ~2 min
    await seedCreates(user.id, LISTINGS_CREATED_PER_HOUR_MAX - 1, 60);
    const res = await post(cookie);
    const body = await expectApiError(res, 429, "listing_limit");
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(100);
    expect(retryAfter).toBeLessThanOrEqual(120);
    expect(body.error.message).toBe(
      "You can post up to 20 listings an hour. Try again in 2 minutes.",
    );

    // Once that create is older than an hour, there's room again.
    await db
      .prepare("UPDATE posting_creates SET created_at = ? WHERE user_id = ? AND created_at < ?")
      .bind(nowSeconds() - LISTINGS_RATE_WINDOW_SECONDS - 1, user.id, nowSeconds() - 600)
      .run();
    expect((await post(cookie)).status).toBe(201);
  });

  it("says 1 minute, not 1 minutes", async () => {
    const { cookie, user } = await registerUser("almost");
    await seedCreates(user.id, 1, LISTINGS_RATE_WINDOW_SECONDS - 30);
    await seedCreates(user.id, LISTINGS_CREATED_PER_HOUR_MAX - 1, 10);
    const body = await expectApiError(await post(cookie), 429, "listing_limit");
    expect(body.error.message).toBe(
      "You can post up to 20 listings an hour. Try again in 1 minute.",
    );
  });

  it("are per user", async () => {
    const { user } = await registerUser("busy-one");
    const { cookie: other } = await registerUser("calm-one");
    await seedListings(db, user.id, LISTINGS_ACTIVE_MAX);
    await seedCreates(user.id, LISTINGS_CREATED_PER_HOUR_MAX);
    expect((await post(other)).status).toBe(201);
  });

  it("editing doesn't count as creating", async () => {
    const { cookie, user } = await registerUser("editor");
    const [id] = await seedListings(db, user.id, 1);
    await seedCreates(user.id, LISTINGS_CREATED_PER_HOUR_MAX);
    const res = await api(`/api/postings/${id}`, {
      method: "PUT",
      body: { ...validPosting, title: "Edited while limited" },
      cookie,
    });
    expect(res.status).toBe(200);
  });

  it("the daily cron drops create-log rows older than the window", async () => {
    const { user } = await registerUser("cron-poster");
    await seedCreates(user.id, 2, LISTINGS_RATE_WINDOW_SECONDS + 60);
    await seedCreates(user.id, 1, 60);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "17 3 * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    const row = await db
      .prepare("SELECT count(*) AS n FROM posting_creates WHERE user_id = ?")
      .bind(user.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});

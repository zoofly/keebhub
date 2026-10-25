// /api/postings: public reads, owner-only writes.
import { Hono } from "hono";
import { z } from "zod";
import {
  LISTINGS_ACTIVE_MAX,
  LISTINGS_CREATED_PER_HOUR_MAX,
  LISTINGS_RATE_WINDOW_SECONDS,
} from "../../shared/limits";
import { IdParam, PageQuery, PostingInput } from "../../shared/schemas";
import {
  createPosting,
  deletePosting,
  getPosting,
  listingUsage,
  listPostings,
  toPosting,
  updatePosting,
} from "../db/postings";
import type { AppEnv } from "../env";
import { decodeIdCursor, encodeIdCursor } from "../lib/cursor";
import { nowSeconds } from "../lib/time";
import { jsonError } from "../middleware/errors";
import { requireUser } from "../middleware/session";
import { zJson, zParam, zQuery } from "../middleware/validate";

const IdParams = z.object({ id: IdParam });

export const postingRoutes = new Hono<AppEnv>()
  // Market feed, newest first. Public.
  .get("/", zQuery(PageQuery), async (c) => {
    const { limit, cursor } = c.req.valid("query");
    const beforeId = cursor === undefined ? null : decodeIdCursor(cursor);
    if (cursor !== undefined && beforeId === null) {
      return jsonError(c, 400, "validation_failed", "Invalid cursor", {
        cursor: ["Invalid cursor"],
      });
    }
    const rows = await listPostings(c.env.DB, { limit, beforeId });
    const items = rows.slice(0, limit).map(toPosting);
    const last = items.at(-1);
    const nextCursor = rows.length > limit && last ? encodeIdCursor(last.id) : null;
    return c.json({ items, nextCursor }, 200);
  })

  // One posting. Public.
  .get("/:id", zParam(IdParams), async (c) => {
    const { id } = c.req.valid("param");
    const posting = await getPosting(c.env.DB, id);
    if (!posting) {
      return jsonError(c, 404, "not_found", "Posting not found");
    }
    return c.json(posting, 200);
  })

  .post("/", requireUser, zJson(PostingInput), async (c) => {
    const input = c.req.valid("json");
    const userId = c.get("user").id;

    // Both limits are checked with one read, before anything is written.
    const now = nowSeconds();
    const usage = await listingUsage(c.env.DB, userId, now - LISTINGS_RATE_WINDOW_SECONDS);
    if (usage.active >= LISTINGS_ACTIVE_MAX) {
      return jsonError(
        c,
        429,
        "listing_limit",
        `You can have up to ${LISTINGS_ACTIVE_MAX} active listings. Delete one to post another.`,
      );
    }
    if (usage.recent >= LISTINGS_CREATED_PER_HOUR_MAX) {
      const oldest = usage.oldestRecent ?? now;
      const retryAfter = Math.max(1, oldest + LISTINGS_RATE_WINDOW_SECONDS - now);
      const minutes = Math.ceil(retryAfter / 60);
      c.header("Retry-After", String(retryAfter));
      return jsonError(
        c,
        429,
        "listing_limit",
        `You can post up to ${LISTINGS_CREATED_PER_HOUR_MAX} listings an hour. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
      );
    }

    const id = await createPosting(c.env.DB, userId, input);
    const posting = await getPosting(c.env.DB, id);
    if (!posting) {
      throw new Error("created posting not found");
    }
    return c.json(posting, 201);
  })

  // Owner only; someone else's posting is a 404 (no existence leak).
  .put("/:id", requireUser, zParam(IdParams), zJson(PostingInput), async (c) => {
    const { id } = c.req.valid("param");
    const updated = await updatePosting(c.env.DB, id, c.get("user").id, c.req.valid("json"));
    const posting = updated ? await getPosting(c.env.DB, id) : null;
    if (!posting) {
      return jsonError(c, 404, "not_found", "Posting not found");
    }
    return c.json(posting, 200);
  })

  .delete("/:id", requireUser, zParam(IdParams), async (c) => {
    const { id } = c.req.valid("param");
    if (!(await deletePosting(c.env.DB, id, c.get("user").id))) {
      return jsonError(c, 404, "not_found", "Posting not found");
    }
    return c.body(null, 204);
  });

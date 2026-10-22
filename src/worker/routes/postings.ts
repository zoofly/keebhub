// /api/postings: public reads, owner-only writes.
import { Hono } from "hono";
import { z } from "zod";
import { IdParam, PageQuery, PostingInput } from "../../shared/schemas";
import {
  createPosting,
  deletePosting,
  getPosting,
  listPostings,
  toPosting,
  updatePosting,
} from "../db/postings";
import type { AppEnv } from "../env";
import { decodeIdCursor, encodeIdCursor } from "../lib/cursor";
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
    const id = await createPosting(c.env.DB, c.get("user").id, input);
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

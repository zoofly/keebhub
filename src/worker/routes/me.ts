// /api/me: the signed-in user's postings, saved listings and account.
import { Hono } from "hono";
import { z } from "zod";
import { DeleteAccountInput, IdParam, PageQuery } from "../../shared/schemas";
import { logAuthEvent } from "../auth/log";
import { peppersFromEnv, verifyPassword } from "../auth/password";
import { clearSessionCookie } from "../auth/session";
import { listPostings, toPosting } from "../db/postings";
import { listSaved, listSavedIds, savePosting, toSavedPosting, unsavePosting } from "../db/saved";
import {
  ACCOUNT_SESSION_RULE,
  accountSessionKey,
  clearThrottleStatement,
  lockedFor,
  recordAttemptStatement,
} from "../db/throttle";
import { deleteUser, findCredentialsById } from "../db/users";
import type { AppEnv } from "../env";
import {
  decodeIdCursor,
  decodeSavedCursor,
  encodeIdCursor,
  encodeSavedCursor,
} from "../lib/cursor";
import { jsonError } from "../middleware/errors";
import { clientIp, rateLimited } from "../middleware/rateLimit";
import { requireUser } from "../middleware/session";
import { zJson, zParam, zQuery } from "../middleware/validate";

const PostingIdParams = z.object({ postingId: IdParam });

export const meRoutes = new Hono<AppEnv>()
  .use(requireUser)

  // The user's own postings, newest first.
  .get("/postings", zQuery(PageQuery), async (c) => {
    const { limit, cursor } = c.req.valid("query");
    const beforeId = cursor === undefined ? null : decodeIdCursor(cursor);
    if (cursor !== undefined && beforeId === null) {
      return jsonError(c, 400, "validation_failed", "Invalid cursor", {
        cursor: ["Invalid cursor"],
      });
    }
    const rows = await listPostings(c.env.DB, { limit, beforeId, userId: c.get("user").id });
    const items = rows.slice(0, limit).map(toPosting);
    const last = items.at(-1);
    const nextCursor = rows.length > limit && last ? encodeIdCursor(last.id) : null;
    return c.json({ items, nextCursor }, 200);
  })

  // Saved listings, most recently saved first.
  .get("/saved", zQuery(PageQuery), async (c) => {
    const { limit, cursor } = c.req.valid("query");
    const after = cursor === undefined ? null : decodeSavedCursor(cursor);
    if (cursor !== undefined && after === null) {
      return jsonError(c, 400, "validation_failed", "Invalid cursor", {
        cursor: ["Invalid cursor"],
      });
    }
    const rows = await listSaved(c.env.DB, c.get("user").id, { limit, after });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > limit && last ? encodeSavedCursor(last.saved_at, last.id) : null;
    return c.json({ items: page.map(toSavedPosting), nextCursor }, 200);
  })

  // All saved posting ids (compact), for the Save toggles on any page.
  .get("/saved/ids", async (c) => {
    const ids = await listSavedIds(c.env.DB, c.get("user").id);
    return c.json({ ids }, 200);
  })

  // Idempotent save: 201 when added, 200 when already saved.
  .put("/saved/:postingId", zParam(PostingIdParams), async (c) => {
    const { postingId } = c.req.valid("param");
    const result = await savePosting(c.env.DB, c.get("user").id, postingId);
    if (result.status === "missing") {
      return jsonError(c, 404, "not_found", "Posting not found");
    }
    return result.status === "created" ? c.json(result.saved, 201) : c.json(result.saved, 200);
  })

  .delete("/saved/:postingId", zParam(PostingIdParams), async (c) => {
    const { postingId } = c.req.valid("param");
    if (!(await unsavePosting(c.env.DB, c.get("user").id, postingId))) {
      return jsonError(c, 404, "not_found", "Not in your saved listings");
    }
    return c.body(null, 204);
  })

  // Delete the account (confirmed with the password). Postings, saved
  // listings and sessions cascade.
  .delete("/", zJson(DeleteAccountInput), async (c) => {
    const { password } = c.req.valid("json");
    const user = c.get("user");
    const db = c.env.DB;
    const ip = clientIp(c);
    // Its own per-session throttle (shared with password change), separate
    // from login lockouts.
    const sessionKey = accountSessionKey(c.get("session").id);

    const wait = await lockedFor(db, [sessionKey]);
    if (wait > 0) {
      return rateLimited(c, wait);
    }
    const credentials = await findCredentialsById(db, user.id);
    const result = await verifyPassword(password, credentials?.passwordHash, peppersFromEnv(c.env));
    if (!result.valid) {
      await recordAttemptStatement(db, sessionKey, ACCOUNT_SESSION_RULE).run();
      await logAuthEvent("auth.account_delete_failed", { userId: user.id, ip });
      return jsonError(c, 400, "validation_failed", "Password is incorrect", {
        password: ["Password is incorrect"],
      });
    }
    await db.batch([clearThrottleStatement(db, sessionKey)]);
    await deleteUser(db, user.id);
    clearSessionCookie(c);
    await logAuthEvent("auth.account_deleted", { userId: user.id, ip });
    return c.body(null, 204);
  });

// saved_listings table, always scoped to one user.
import type { SavedListing, SavedPosting } from "../../shared/schemas";
import { toIso } from "../lib/time";
import { type PostingRow, toPosting } from "./postings";

interface SavedRow extends PostingRow {
  saved_at: number;
}

const LIST_SAVED_SQL = `SELECT p.id, p.user_id, p.title, p.description, p.image_url, p.price_cents,
    p.created_at, p.updated_at, u.username AS seller_username, s.created_at AS saved_at
  FROM saved_listings s
  JOIN postings p ON p.id = s.posting_id
  JOIN users u ON u.id = p.user_id
  WHERE s.user_id = ?1
    AND (s.created_at < ?2 OR (s.created_at = ?2 AND s.posting_id < ?3))
  ORDER BY s.created_at DESC, s.posting_id DESC
  LIMIT ?4`;

export interface SavedCursor {
  savedAt: number;
  postingId: number;
}

export const toSavedPosting = (row: SavedRow): SavedPosting => ({
  ...toPosting(row),
  savedAt: toIso(row.saved_at),
});

/** Most recently saved first; returns up to limit + 1 rows. */
export async function listSaved(
  db: D1Database,
  userId: number,
  opts: { limit: number; after: SavedCursor | null },
): Promise<SavedRow[]> {
  const after = opts.after ?? {
    savedAt: Number.MAX_SAFE_INTEGER,
    postingId: Number.MAX_SAFE_INTEGER,
  };
  const { results } = await db
    .prepare(LIST_SAVED_SQL)
    .bind(userId, after.savedAt, after.postingId, opts.limit + 1)
    .all<SavedRow>();
  return results;
}

/** Every posting id the user has saved, newest save first. */
export async function listSavedIds(db: D1Database, userId: number): Promise<number[]> {
  const { results } = await db
    .prepare(
      "SELECT posting_id FROM saved_listings WHERE user_id = ? ORDER BY created_at DESC, posting_id DESC",
    )
    .bind(userId)
    .all<{ posting_id: number }>();
  return results.map((row) => row.posting_id);
}

export type SaveResult =
  | { status: "created" | "exists"; saved: SavedListing }
  | { status: "missing" };

/** Idempotent save. "missing" when the posting doesn't exist. */
export async function savePosting(
  db: D1Database,
  userId: number,
  postingId: number,
): Promise<SaveResult> {
  const inserted = await db
    .prepare(
      `INSERT INTO saved_listings (user_id, posting_id)
       SELECT ?, id FROM postings WHERE id = ?
       ON CONFLICT (user_id, posting_id) DO NOTHING
       RETURNING posting_id, created_at`,
    )
    .bind(userId, postingId)
    .first<{ posting_id: number; created_at: number }>();
  if (inserted) {
    return {
      status: "created",
      saved: { postingId: inserted.posting_id, savedAt: toIso(inserted.created_at) },
    };
  }
  const existing = await db
    .prepare(
      "SELECT posting_id, created_at FROM saved_listings WHERE user_id = ? AND posting_id = ?",
    )
    .bind(userId, postingId)
    .first<{ posting_id: number; created_at: number }>();
  return existing
    ? {
        status: "exists",
        saved: { postingId: existing.posting_id, savedAt: toIso(existing.created_at) },
      }
    : { status: "missing" };
}

/** Returns false when the posting wasn't in the user's saved list. */
export async function unsavePosting(
  db: D1Database,
  userId: number,
  postingId: number,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM saved_listings WHERE user_id = ? AND posting_id = ?")
    .bind(userId, postingId)
    .run();
  return result.meta.changes > 0;
}

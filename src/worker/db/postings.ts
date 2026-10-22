// postings table. Owner checks live in the SQL (WHERE id = ? AND user_id = ?).
import type { PostingInput, PostingWithSeller } from "../../shared/schemas";
import { toIso } from "../lib/time";

interface PostingRow {
  id: number;
  user_id: number;
  title: string;
  description: string;
  image_url: string;
  price_cents: number;
  created_at: number;
  updated_at: number;
  seller_username: string;
}

// Full SQL strings (no interpolation; CI rejects template-built SQL).
const LIST_SQL = `SELECT p.id, p.user_id, p.title, p.description, p.image_url, p.price_cents,
    p.created_at, p.updated_at, u.username AS seller_username
  FROM postings p JOIN users u ON u.id = p.user_id
  WHERE p.id < ?
  ORDER BY p.id DESC
  LIMIT ?`;

const LIST_BY_USER_SQL = `SELECT p.id, p.user_id, p.title, p.description, p.image_url, p.price_cents,
    p.created_at, p.updated_at, u.username AS seller_username
  FROM postings p JOIN users u ON u.id = p.user_id
  WHERE p.user_id = ? AND p.id < ?
  ORDER BY p.id DESC
  LIMIT ?`;

const GET_SQL = `SELECT p.id, p.user_id, p.title, p.description, p.image_url, p.price_cents,
    p.created_at, p.updated_at, u.username AS seller_username
  FROM postings p JOIN users u ON u.id = p.user_id
  WHERE p.id = ?`;

export const toPosting = (row: PostingRow): PostingWithSeller => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  imageUrl: row.image_url,
  priceCents: row.price_cents,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  sellerUsername: row.seller_username,
});

export type { PostingRow };

/**
 * Newest first, keyset-paged on id: returns up to `limit` rows with
 * id < `beforeId`, plus one extra to tell whether another page exists.
 */
export async function listPostings(
  db: D1Database,
  opts: { limit: number; beforeId: number | null; userId?: number },
): Promise<PostingRow[]> {
  const before = opts.beforeId ?? Number.MAX_SAFE_INTEGER;
  const statement =
    opts.userId === undefined
      ? db.prepare(LIST_SQL).bind(before, opts.limit + 1)
      : db.prepare(LIST_BY_USER_SQL).bind(opts.userId, before, opts.limit + 1);
  const { results } = await statement.all<PostingRow>();
  return results;
}

export async function getPosting(db: D1Database, id: number): Promise<PostingWithSeller | null> {
  const row = await db.prepare(GET_SQL).bind(id).first<PostingRow>();
  return row ? toPosting(row) : null;
}

export async function createPosting(
  db: D1Database,
  userId: number,
  input: PostingInput,
): Promise<number> {
  const row = await db
    .prepare(
      "INSERT INTO postings (user_id, title, description, image_url, price_cents) VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(userId, input.title, input.description, input.imageUrl, input.priceCents)
    .first<{ id: number }>();
  if (!row) {
    throw new Error("INSERT INTO postings returned no row");
  }
  return row.id;
}

/** Returns false when the posting doesn't exist or isn't the user's. */
export async function updatePosting(
  db: D1Database,
  id: number,
  userId: number,
  input: PostingInput,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE postings
       SET title = ?, description = ?, image_url = ?, price_cents = ?, updated_at = unixepoch()
       WHERE id = ? AND user_id = ?`,
    )
    .bind(input.title, input.description, input.imageUrl, input.priceCents, id, userId)
    .run();
  return result.meta.changes > 0;
}

/** Returns false when the posting doesn't exist or isn't the user's. */
export async function deletePosting(db: D1Database, id: number, userId: number): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM postings WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  return result.meta.changes > 0;
}

// users table. The password hash never leaves this module except to the
// password verifier (findCredentials).
import type { User } from "../../shared/schemas";

export interface Credentials {
  user: User;
  passwordHash: string | null;
}

export async function findCredentials(
  db: D1Database,
  username: string,
): Promise<Credentials | null> {
  // username is COLLATE NOCASE, so this match is case-insensitive.
  const row = await db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .bind(username.trim())
    .first<{ id: number; username: string; password_hash: string | null }>();
  return row
    ? { user: { id: row.id, username: row.username }, passwordHash: row.password_hash }
    : null;
}

export async function findCredentialsById(db: D1Database, id: number): Promise<Credentials | null> {
  const row = await db
    .prepare("SELECT id, username, password_hash FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: number; username: string; password_hash: string | null }>();
  return row
    ? { user: { id: row.id, username: row.username }, passwordHash: row.password_hash }
    : null;
}

export async function usernameTaken(db: D1Database, username: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS taken FROM users WHERE username = ?")
    .bind(username)
    .first();
  return row !== null;
}

/** Returns null if the username is already taken (case-insensitively). */
export async function createUser(
  db: D1Database,
  username: string,
  passwordHash: string,
): Promise<User | null> {
  const row = await db
    .prepare(
      "INSERT INTO users (username, password_hash) VALUES (?, ?) ON CONFLICT (username) DO NOTHING RETURNING id, username",
    )
    .bind(username, passwordHash)
    .first<{ id: number; username: string }>();
  return row ? { id: row.id, username: row.username } : null;
}

export function updatePasswordHashStatement(db: D1Database, userId: number, passwordHash: string) {
  return db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, userId);
}

/** Deletes the user; postings, saved listings and sessions cascade. */
export async function deleteUser(db: D1Database, userId: number): Promise<void> {
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

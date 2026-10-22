// sessions table (Lucia auth_session pattern). See auth/session.ts.

export interface SessionRow {
  id: string;
  secretHash: Uint8Array<ArrayBuffer>;
  userId: number;
  username: string;
  createdAt: number;
  expiresAt: number;
}

export async function insertSession(
  db: D1Database,
  session: {
    id: string;
    secretHash: Uint8Array<ArrayBuffer>;
    userId: number;
    createdAt: number;
    expiresAt: number;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO sessions (id, secret_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(session.id, session.secretHash, session.userId, session.createdAt, session.expiresAt)
    .run();
}

export async function findSession(db: D1Database, id: string): Promise<SessionRow | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.secret_hash, s.user_id, s.created_at, s.expires_at, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      secret_hash: ArrayBuffer | number[];
      user_id: number;
      created_at: number;
      expires_at: number;
      username: string;
    }>();
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    secretHash: new Uint8Array(row.secret_hash),
    userId: row.user_id,
    username: row.username,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function updateSessionExpiry(
  db: D1Database,
  id: string,
  expiresAt: number,
): Promise<void> {
  await db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(expiresAt, id).run();
}

export async function deleteSession(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
}

export function deleteOtherSessionsStatement(db: D1Database, userId: number, keepId: string) {
  return db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").bind(userId, keepId);
}

/** Removes sessions past their sliding expiry or absolute cap. */
export function purgeSessionsStatement(db: D1Database, now: number, absoluteLifetime: number) {
  return db
    .prepare("DELETE FROM sessions WHERE expires_at <= ? OR created_at <= ?")
    .bind(now, now - absoluteLifetime);
}

-- keebhub D1 schema (SQLite). Applied with `wrangler d1 migrations apply`.
--
-- Conventions:
-- - STRICT tables, INTEGER PRIMARY KEY ids (SQLite rowid aliases).
-- - Timestamps are unix seconds (INTEGER); the API turns them into ISO strings.
-- - Money is integer cents.
-- - CHECK constraints are a backstop; the zod schemas in src/shared are the
--   primary validation and must stay in step with the limits here.
-- - D1 enforces foreign keys by default.
--
-- Migrations run before each deploy, so later migrations must be backward
-- compatible with the Worker version that is still running (expand, then
-- contract).

-- Usernames: 3-32 of [A-Za-z0-9._-], starting with a letter or digit
-- (USERNAME_* in src/shared/limits.ts). Uniqueness is case-insensitive
-- (NOCASE folds ASCII, which is all the allowed characters); the name is
-- stored as typed for display.
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE
                CHECK (
                  length(username) BETWEEN 3 AND 32
                  AND username NOT GLOB '*[^A-Za-z0-9._-]*'
                  AND substr(username, 1, 1) GLOB '[A-Za-z0-9]'
                ),
  -- PHC-style string, e.g. $pbkdf2-sha256$v=1$i=100000$p=1$<salt>$<hash>.
  -- NULL is reserved for passkey-only accounts (Phase B5).
  password_hash TEXT CHECK (password_hash IS NULL OR length(password_hash) <= 255),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Server-side sessions (Lucia auth_session pattern). The cookie holds
-- "<id>.<secret>"; only SHA-256(secret) is stored, so a leaked row or log
-- line cannot be replayed.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  secret_hash BLOB NOT NULL CHECK (length(secret_hash) = 32),
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  -- Sliding (7 days); the 30-day absolute cap is enforced from created_at.
  expires_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE postings (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  -- LIKE is case-insensitive in SQLite; zod does the exact URL check.
  image_url   TEXT NOT NULL CHECK (length(image_url) <= 2048 AND image_url LIKE 'https://%'),
  -- 0 .. 99,999,999.99
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 9999999999),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
-- GET /api/me/postings (WHERE user_id = ? ORDER BY id DESC) and the
-- ON DELETE CASCADE lookup from users. The market feed pages by id DESC on
-- the primary key.
CREATE INDEX postings_user_id_id_idx ON postings (user_id, id DESC);

CREATE TABLE saved_listings (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  posting_id INTEGER NOT NULL REFERENCES postings (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, posting_id)
) STRICT;
-- ON DELETE CASCADE lookup from postings.
CREATE INDEX saved_listings_posting_id_idx ON saved_listings (posting_id);

-- Public switch catalog (GET /api/switches).
CREATE TABLE switches (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 100),
  manufacturer TEXT NOT NULL CHECK (length(trim(manufacturer)) BETWEEN 1 AND 100),
  switch_type  TEXT NOT NULL CHECK (switch_type IN ('linear', 'tactile', 'clicky')),
  description  TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  image_url    TEXT CHECK (image_url IS NULL OR (length(image_url) <= 2048 AND image_url LIKE 'https://%')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Login/register throttling (Phase B2). Keys look like
-- 'login:user:<normalized username>', 'login:ip:<ip>', 'register:ip:<ip>'.
CREATE TABLE auth_throttle (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL CHECK (count >= 0),
  window_start INTEGER NOT NULL,
  locked_until INTEGER
) STRICT;

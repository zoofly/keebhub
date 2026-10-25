-- One row per listing created, for the "20 creates per rolling hour" limit
-- (LISTINGS_CREATED_PER_HOUR_MAX in src/shared/limits.ts). Kept apart from
-- postings so deleting a listing doesn't give the create back. The daily
-- cron removes rows older than the window.
CREATE TABLE posting_creates (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX posting_creates_user_time_idx ON posting_creates (user_id, created_at);

-- GET /api/me/saved pages by (created_at DESC, posting_id DESC) per user.
CREATE INDEX saved_listings_user_created_idx
  ON saved_listings (user_id, created_at DESC, posting_id DESC);

-- keebhub schema
--
-- Database name: keebhub (see server/modules/pool.js; override with PGDATABASE
-- or DATABASE_URL).
--
-- USER is a reserved keyword with Postgres
-- You must use double quotes in every query that user is in:
-- ex. SELECT * FROM "user";
-- Otherwise you will have errors!
--
-- Every statement uses IF NOT EXISTS so this file can be re-run safely, e.g. to
-- add the indexes to an existing database. Note that IF NOT EXISTS does NOT
-- add new columns or constraints to a table that already exists.

CREATE TABLE IF NOT EXISTS "user" (
    "id" SERIAL PRIMARY KEY,
    "username" VARCHAR (80) UNIQUE NOT NULL,
    "password" VARCHAR (1000) NOT NULL
);

-- ---------------------------------------------------------------------------
-- RECONSTRUCTED TABLES
-- The original CREATE statements for the tables below were never committed.
-- They were reconstructed from how server/routes/* and the React components
-- use them. Compare against the live (Heroku) database before applying any
-- migration there.
-- ---------------------------------------------------------------------------

-- Marketplace listings. Used by /market (postings.router.js) and /mylistings.
-- Column limits mirror isValidPosting() in server/routes/postings.router.js.
CREATE TABLE IF NOT EXISTS "postings" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "title" VARCHAR (200) NOT NULL CHECK (trim("title") <> ''),
    "description" VARCHAR (5000) NOT NULL DEFAULT '',
    "image" VARCHAR (2048) NOT NULL CHECK (lower("image") LIKE 'http://%' OR lower("image") LIKE 'https://%'),
    "price" NUMERIC (10, 2) NOT NULL CHECK ("price" >= 0),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GET /mylistings: WHERE user_id = $1 ORDER BY id DESC.
-- Also serves the ON DELETE CASCADE lookup when a user is deleted.
-- (GET /market pages by id DESC and uses the primary key; PUT/DELETE use the
-- primary key plus a user_id filter.)
CREATE INDEX IF NOT EXISTS "postings_user_id_id_idx"
    ON "postings" ("user_id", "id" DESC);

-- Reference catalog of switches shown on the Switches page (GET /switches).
-- Columns come from src/components/SwitchList/SwitchList.jsx.
CREATE TABLE IF NOT EXISTS "switches" (
    "id" SERIAL PRIMARY KEY,
    "switch_name" VARCHAR (100) NOT NULL UNIQUE CHECK (trim("switch_name") <> ''),
    "image" VARCHAR (2048) CHECK ("image" IS NULL OR lower("image") LIKE 'http://%' OR lower("image") LIKE 'https://%'),
    "description" VARCHAR (5000) NOT NULL DEFAULT '',
    "switch_type" VARCHAR (50) NOT NULL,     -- e.g. linear / tactile / clicky
    "actuation_point" VARCHAR (20),          -- free text as displayed, e.g. '2.0mm'
    "switch_mount" VARCHAR (50)              -- e.g. 3-pin / 5-pin
);

-- Listings a user has bookmarked (/saved). One row per (user, posting).
CREATE TABLE IF NOT EXISTS "saved_listings" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "posting_id" INTEGER NOT NULL REFERENCES "postings" ("id") ON DELETE CASCADE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The unique index also serves GET /saved (WHERE user_id = $1).
    UNIQUE ("user_id", "posting_id")
);

-- Serves the ON DELETE CASCADE lookup when a posting is deleted.
CREATE INDEX IF NOT EXISTS "saved_listings_posting_id_idx"
    ON "saved_listings" ("posting_id");

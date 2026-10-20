const express = require("express");
const pool = require("../modules/pool");
const router = express.Router();
const {
  rejectUnauthenticated,
} = require("../modules/authentication-middleware");
const {
  asyncHandler,
  httpError,
  validateIdParam,
} = require("../modules/http");

// Columns returned to the client for a posting
const POSTING_COLUMNS = `id, user_id, title, description, image, price, created_at`;

// GET /market pagination. With no query params the first page is returned,
// newest first.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const MAX_PRICE = 99999999.99; // postings.price is NUMERIC(10, 2)

// Reject postings with missing fields or non-http(s) image links
const isValidPosting = (body) => {
  const { title, description, image, price } = body;
  if (typeof title !== "string" || !title.trim() || title.length > 200) {
    return false;
  }
  if (typeof description !== "string" || description.length > 5000) {
    return false;
  }
  if (typeof price !== "number" && (typeof price !== "string" || !price.trim())) {
    return false;
  }
  if (!Number.isFinite(Number(price)) || Number(price) < 0 || Number(price) > MAX_PRICE) {
    return false;
  }
  if (typeof image !== "string" || image.length > 2048) {
    return false;
  }
  try {
    const url = new URL(image);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

// Parse an optional non-negative integer query param
const parseQueryInt = (value, fallback, name) => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[0-9]{1,9}$/.test(value)) {
    throw httpError(400, `${name} must be a non-negative integer`);
  }
  return Number(value);
};

router.param("id", validateIdParam);

/**
 * GET /market?limit=&offset=
 * Lists postings newest first. Response body is still a plain array.
 * limit defaults to 100 and is capped at 100. When more rows exist, the
 * X-Next-Offset response header holds the offset of the next page.
 */
router.get(
  "/",
  rejectUnauthenticated,
  asyncHandler(async (req, res) => {
    const limit = Math.min(
      Math.max(parseQueryInt(req.query.limit, DEFAULT_LIMIT, "limit"), 1),
      MAX_LIMIT
    );
    const offset = parseQueryInt(req.query.offset, 0, "offset");

    // Fetch one extra row to know whether another page exists
    const result = await pool.query(
      `SELECT ${POSTING_COLUMNS} FROM postings
       ORDER BY id DESC
       LIMIT $1 OFFSET $2;`,
      [limit + 1, offset]
    );
    const rows = result.rows.slice(0, limit);
    if (result.rows.length > limit) {
      res.set("X-Next-Offset", String(offset + limit));
    }
    res.json(rows);
  })
);

/**
 * Create a posting owned by the logged in user.
 * 201 + the created posting.
 */
router.post(
  "/",
  rejectUnauthenticated,
  asyncHandler(async (req, res) => {
    if (!isValidPosting(req.body)) {
      throw httpError(400, "Invalid posting");
    }
    const result = await pool.query(
      `INSERT INTO postings (title, description, image, price, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${POSTING_COLUMNS};`,
      [
        req.body.title,
        req.body.description,
        req.body.image,
        Number(req.body.price),
        req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

/**
 * Update a posting. Only the owner can update it (404 otherwise).
 * 200 + the updated posting.
 */
router.put(
  "/:id",
  rejectUnauthenticated,
  asyncHandler(async (req, res) => {
    if (!isValidPosting(req.body)) {
      throw httpError(400, "Invalid posting");
    }
    const result = await pool.query(
      `UPDATE postings
       SET "title"=$1, "description"=$2, "image"=$3, "price"=$4
       WHERE "id"=$5 AND "user_id"=$6
       RETURNING ${POSTING_COLUMNS};`,
      [
        req.body.title,
        req.body.description,
        req.body.image,
        Number(req.body.price),
        req.params.id,
        req.user.id,
      ]
    );
    if (result.rowCount === 0) {
      throw httpError(404);
    }
    res.json(result.rows[0]);
  })
);

/**
 * Delete a posting. Only the owner can delete it (404 otherwise).
 * 204 No Content.
 */
router.delete(
  "/:id",
  rejectUnauthenticated,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `DELETE FROM postings WHERE id=$1 AND user_id=$2;`,
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      throw httpError(404);
    }
    res.sendStatus(204);
  })
);

module.exports = router;
module.exports.isValidPosting = isValidPosting;
module.exports.POSTING_COLUMNS = POSTING_COLUMNS;

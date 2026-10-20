const express = require('express');
const pool = require('../modules/pool');
const router = express.Router();
const {
  rejectUnauthenticated,
} = require('../modules/authentication-middleware');
const {
  asyncHandler,
  httpError,
  parseId,
  validateIdParam,
} = require('../modules/http');

const SAVED_COLUMNS = `id, posting_id, created_at`;

router.param('id', validateIdParam);

/**
 * GET /saved: the logged in user's saved listings with the posting details,
 * most recently saved first.
 */
router.get(
  '/',
  rejectUnauthenticated,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT s.id, s.posting_id, s.created_at AS saved_at,
              p.user_id AS seller_id, p.title, p.description, p.image, p.price
       FROM saved_listings s
       JOIN postings p ON p.id = s.posting_id
       WHERE s.user_id = $1
       ORDER BY s.id DESC;`,
      [req.user.id]
    );
    res.json(result.rows);
  })
);

/**
 * POST /saved { posting_id }: save a listing for the logged in user.
 * 201 + the saved row, 200 + the existing row if it was already saved,
 * 404 if the posting does not exist.
 */
router.post(
  '/',
  rejectUnauthenticated,
  asyncHandler(async (req, res) => {
    const postingId = parseId(req.body.posting_id);
    if (postingId === null) {
      throw httpError(400, 'posting_id must be a positive integer');
    }
    let inserted;
    try {
      inserted = await pool.query(
        `INSERT INTO saved_listings (user_id, posting_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, posting_id) DO NOTHING
         RETURNING ${SAVED_COLUMNS};`,
        [req.user.id, postingId]
      );
    } catch (err) {
      if (err.code === '23503') {
        throw httpError(404, 'Posting not found');
      }
      throw err;
    }
    if (inserted.rowCount > 0) {
      return res.status(201).json(inserted.rows[0]);
    }
    const existing = await pool.query(
      `SELECT ${SAVED_COLUMNS} FROM saved_listings
       WHERE user_id = $1 AND posting_id = $2;`,
      [req.user.id, postingId]
    );
    res.json(existing.rows[0]);
  })
);

/**
 * DELETE /saved/:id: remove one of the user's saved listings. 204, or 404 if
 * it does not exist or belongs to someone else.
 */
router.delete(
  '/:id',
  rejectUnauthenticated,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `DELETE FROM saved_listings WHERE id = $1 AND user_id = $2;`,
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      throw httpError(404);
    }
    res.sendStatus(204);
  })
);

module.exports = router;

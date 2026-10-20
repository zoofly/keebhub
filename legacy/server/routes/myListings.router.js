const express = require("express");
const pool = require("../modules/pool");
const router = express.Router();
const {
  rejectUnauthenticated,
} = require("../modules/authentication-middleware");
const { asyncHandler } = require("../modules/http");
const { POSTING_COLUMNS } = require("./postings.router");

// The logged in user's own postings, newest first
// (served by the postings (user_id, id DESC) index).
router.get(
  "/",
  rejectUnauthenticated,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT ${POSTING_COLUMNS} FROM postings
       WHERE user_id=$1
       ORDER BY id DESC;`,
      [req.user.id]
    );
    res.json(result.rows);
  })
);

module.exports = router;

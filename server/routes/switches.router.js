const express = require("express");
const pool = require("../modules/pool");
const { asyncHandler } = require("../modules/http");
const router = express.Router();

/**
 * GET /switches: the public switch catalog.
 * It is reference data that rarely changes, so browsers may reuse it for a
 * few minutes (and revalidate with the ETag after that).
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, switch_name, image, description, switch_type,
              actuation_point, switch_mount
       FROM switches
       ORDER BY id;`
    );
    res.set("Cache-Control", "public, max-age=300");
    res.json(result.rows);
  })
);

module.exports = router;

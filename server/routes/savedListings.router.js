const express = require('express');
const pool = require('../modules/pool');
const router = express.Router();

/**
 * GET route template
 */
router.get('/', (req, res) => {
  // GET route code here
  const queryText= `SELECT * from saved_listings;`;
  pool.query(queryText)
  .then(dbResponse => {
    console.log(dbResponse.rows);
    res.send(dbResponse.rows);
  }) .catch (error => {
    console.log('Error in getting saved listings', error);
    res.sendStatus(500);
  });
});

/**
 * POST route template
 */
router.post('/', (req, res) => {
  // POST route code here
});

module.exports = router;

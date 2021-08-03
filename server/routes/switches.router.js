const express = require('express');
const pool = require('../modules/pool');
const router = express.Router();

/**
 * GET route template
 */
router.get('/', (req, res) => {
  // GET route code here
  const queryText= `SELECT * from switches;`;
  pool.query(queryText)
  .then(dbResponse => {
    res.send(dbResponse.rows);
  }) .catch (error => {
    console.log('Error in getting switches', error);
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

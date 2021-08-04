const express = require("express");
const pool = require("../modules/pool");
const router = express.Router();
const rejectUnauthenticated =
  require("../modules/authentication-middleware").rejectUnauthenticated;
/**
 * Get all of the items from postings 
 */
router.get("/", rejectUnauthenticated, (req, res) => {
  const query = `SELECT * FROM item WHERE user_id=$1;`;
  pool
    .query(query, [req.user.id])
    .then((results) => {
      console.log(results.rows);
      res.send(results.rows);
    })
    .catch((error) => {
      console.log("error GETting items", error);
    });
  //res.sendStatus(200); // For testing only, can be removed
});

/**
 * Add an item for the logged in user to the shelf
 */
router.post("/", rejectUnauthenticated, (req, res) => {
  console.log("req.body:", req.body);
  const addItemQuery = `INSERT INTO item (description, image_url, user_id)
   VALUES ($1, $2, $3);`;
  pool
    .query(addItemQuery, [
      req.body.description,
      req.body.image_url,
      req.user.id,
    ])
    .then((result) => {
      console.log("New Item on shelf is", result);
      res.sendStatus(201);
    })
    .catch((error) => {
      console.log(`ERROR Adding item: ${error}`);
      res.sendStatus(500);
    });

  // endpoint functionality
});
module.exports = router;

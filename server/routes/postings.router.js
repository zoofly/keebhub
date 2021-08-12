const express = require("express");
const pool = require("../modules/pool");
const router = express.Router();
const rejectUnauthenticated =
  require("../modules/authentication-middleware").rejectUnauthenticated;

/**
 * Get all of the items from postings
 */
router.get("/", rejectUnauthenticated, (req, res) => {
  const query = `SELECT * FROM postings;`;
  pool
    .query(query)
    .then((results) => {
      console.log(results.rows);
      res.send(results.rows);
    })
    .catch((error) => {
      console.log("error GETting posts", error);
    });
  //res.sendStatus(200); // For testing only, can be removed
});

/**
 * Add an item for the logged in user to the shelf
 */
router.post("/", rejectUnauthenticated, (req, res) => {
  console.log("req.body:", req.body);
  const createPostQuery = `INSERT INTO postings (title, description, image, price, user_id)
   VALUES ($1, $2, $3, $4, $5);`;
  pool
    .query(createPostQuery, [
      req.body.title,
      req.body.description,
      req.body.image,
      req.body.price,
      req.user.id,
    ])
    .then((result) => {
      console.log("New Item on market", result);
      res.sendStatus(201);
    })
    .catch((error) => {
      console.log(`ERROR creating post: ${error}`);
      res.sendStatus(500);
    });

  // endpoint functionality
});

router.put("/:id", rejectUnauthenticated, (req, res) => {
  console.log(`What is being UPDATED:`, req.params.id);
  const updateQuery = `UPDATE postings SET "title"=$1, "description"=$2, "image"=$3, "price"=$4 WHERE "id"=$5;`;
  pool
    .query(updateQuery, [
      req.body.title,
      req.body.description,
      req.body.image,
      req.body.price,
      req.params.id,
    ])
    .then((result) => {
      console.log("successfully updated post", result);
      res.sendStatus(201);
    })
    .catch((error) => {
      console.log("error updating post", error);
      res.sendStatus(500);
    });
  // endpoint functionality
});

router.delete("/:id", rejectUnauthenticated, (req, res) => {
  console.log(`What is being DELETED:`, req.params.id);
  const deleteItemQuery = `DELETE from postings WHERE id=$1;`;
  pool
    .query(deleteItemQuery, [req.params.id])
    .then((result) => {
      console.log(`Successfully DELETED from database`, result);
      res.sendStatus(201);
    })
    .catch((error) => {
      console.log(`Did not DELETE from database`, error);
      res.sendStatus(500);
    });
  // endpoint functionality
});

module.exports = router;

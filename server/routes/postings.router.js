const express = require("express");
const pool = require("../modules/pool");
const router = express.Router();
const rejectUnauthenticated =
  require("../modules/authentication-middleware").rejectUnauthenticated;

// Reject postings with missing fields or non-http(s) image links
const isValidPosting = (body) => {
  const { title, description, image, price } = body;
  if (typeof title !== "string" || !title.trim() || title.length > 200) {
    return false;
  }
  if (typeof description !== "string" || description.length > 5000) {
    return false;
  }
  if (!Number.isFinite(Number(price)) || Number(price) < 0) {
    return false;
  }
  try {
    const url = new URL(image);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

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
      res.sendStatus(500);
    });
  //res.sendStatus(200); // For testing only, can be removed
});

/**
 * Add an item for the logged in user to the shelf
 */
router.post("/", rejectUnauthenticated, (req, res) => {
  if (!isValidPosting(req.body)) {
    return res.sendStatus(400);
  }
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
  if (!isValidPosting(req.body)) {
    return res.sendStatus(400);
  }
  const updateQuery = `UPDATE postings SET "title"=$1, "description"=$2, "image"=$3, "price"=$4 WHERE "id"=$5 AND "user_id"=$6;`;
  pool
    .query(updateQuery, [
      req.body.title,
      req.body.description,
      req.body.image,
      req.body.price,
      req.params.id,
      req.user.id,
    ])
    .then((result) => {
      // Only the owner can update a posting
      if (result.rowCount === 0) {
        return res.sendStatus(404);
      }
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
  const deleteItemQuery = `DELETE from postings WHERE id=$1 AND user_id=$2;`;
  pool
    .query(deleteItemQuery, [req.params.id, req.user.id])
    .then((result) => {
      // Only the owner can delete a posting
      if (result.rowCount === 0) {
        return res.sendStatus(404);
      }
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

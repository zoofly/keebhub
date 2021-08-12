const express = require("express");
const pool = require("../modules/pool");
const router = express.Router();
const rejectUnauthenticated =
  require("../modules/authentication-middleware").rejectUnauthenticated;

router.get("/", rejectUnauthenticated, (req, res) => {
  const query = `SELECT * FROM postings WHERE user_id=$1;`;
  pool
    .query(query, [req.user.id])
    .then((results) => {
      console.log(results.rows);
      res.send(results.rows);
    })
    .catch((error) => {
      console.log("error GETting posts", error);
    });
  //res.sendStatus(200); // For testing only, can be removed
});

module.exports = router;

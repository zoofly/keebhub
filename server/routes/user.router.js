const express = require('express');
const {
  rejectUnauthenticated,
} = require('../modules/authentication-middleware');
const encryptLib = require('../modules/encryption');
const pool = require('../modules/pool');
const userStrategy = require('../strategies/user.strategy');
const { asyncHandler, httpError } = require('../modules/http');

const router = express.Router();

// Handles Ajax request for user information if user is authenticated
router.get('/', rejectUnauthenticated, (req, res) => {
  // Send back user object from the session ({ id, username })
  res.send(req.user);
});

// Handles POST request with new user data. The password is hashed before
// being inserted. 201 + { id, username } on success, 409 if the username is
// taken.
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const username =
      typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const rawPassword = req.body.password;

    // bcrypt only uses the first 72 bytes of a password
    if (
      !username ||
      username.length > 80 ||
      typeof rawPassword !== 'string' ||
      rawPassword.length < 8 ||
      Buffer.byteLength(rawPassword) > 72
    ) {
      throw httpError(400);
    }
    const password = await encryptLib.encryptPassword(rawPassword);

    try {
      const result = await pool.query(
        `INSERT INTO "user" (username, password)
         VALUES ($1, $2) RETURNING id, username`,
        [username, password]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        throw httpError(409, 'Username is already taken');
      }
      throw err;
    }
  })
);

// Handles login form authenticate/login POST
// userStrategy.authenticate('local') is middleware that we run on this route
// this middleware will run our POST if successful
// this middleware will send a 401 if not successful
router.post('/login', userStrategy.authenticate('local'), (req, res) => {
  // app.js expires sessions by this timestamp
  req.session.loginAt = Date.now();
  res.sendStatus(200);
});

// clear all server session information about this user
router.post('/logout', (req, res, next) => {
  // Use passport's built-in method to log out the user
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    delete req.session.loginAt;
    res.sendStatus(200);
  });
});

module.exports = router;

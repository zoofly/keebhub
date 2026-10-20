const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const encryptLib = require('../modules/encryption');
const pool = require('../modules/pool');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Runs on every request that carries a session cookie. Only select the
// columns the app needs; the password hash never leaves this module.
passport.deserializeUser((id, done) => {
  pool
    .query('SELECT id, username FROM "user" WHERE id = $1', [id])
    .then((result) => {
      // A null user (deleted account) logs the session out
      done(null, result.rows[0] || null);
    })
    .catch((error) => {
      console.error('Error with query during deserializing user', error);
      // results in a 500 via the error handler
      done(error, null);
    });
});

// Does actual work of logging in
passport.use(
  'local',
  new LocalStrategy(async (username, password, done) => {
    // JSON bodies can carry arrays/objects; treat those as bad credentials
    if (typeof username !== 'string' || typeof password !== 'string') {
      return done(null, false);
    }
    try {
      const result = await pool.query(
        'SELECT id, username, password FROM "user" WHERE username = $1',
        [username]
      );
      const user = result.rows[0];
      // Always run bcrypt, even for unknown usernames, so response time does
      // not reveal which usernames exist.
      const match = await encryptLib.comparePassword(
        password,
        user && user.password
      );
      if (user && match) {
        // passwords match; the session only stores user.id
        return done(null, { id: user.id, username: user.username });
      }
      // username/password mismatch -> passport responds 401
      return done(null, false);
    } catch (error) {
      console.error('Error with query for user', error);
      // results in a 500 via the error handler
      return done(error);
    }
  })
);

module.exports = passport;

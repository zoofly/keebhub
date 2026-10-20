const bcrypt = require('bcryptjs');

const SALT_WORK_FACTOR = 10; // This determines how secure the salt should be

// A real bcrypt hash of a random string nobody knows. Logins for unknown
// usernames are compared against it so they take as long as a wrong password
// for a real user (no username probing by timing).
const DUMMY_HASH =
  '$2a$10$VcrmNQ8uCZDV2UsTzbRf4ukx05EzswSLRDqLh1IQsSFRCmDcWGTky';

/*
  These use bcryptjs's async API. The sync versions block the event loop for
  the whole hash (~50-100ms at cost 10), stalling every other request on the
  dyno; the async versions run the work in small chunks between other I/O.
*/

// Hash the password with a fresh random salt. Only the hash is stored.
const encryptPassword = (password) => bcrypt.hash(password, SALT_WORK_FACTOR);

// The stored hash includes its salt, so the candidate is hashed the same way
// and compared. Resolves true on a match.
const comparePassword = (candidatePassword, storedPassword) =>
  bcrypt.compare(candidatePassword, storedPassword || DUMMY_HASH);

module.exports = {
  encryptPassword,
  comparePassword,
};

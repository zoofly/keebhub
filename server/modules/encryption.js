const bcrypt = require('bcrypt');

const SALT_WORK_FACTOR = 10; // This determines how secure the salt should be

// A real bcrypt hash of a random string nobody knows. Logins for unknown
// usernames are compared against it so they take as long as a wrong password
// for a real user (no username probing by timing).
const DUMMY_HASH =
  '$2a$10$VcrmNQ8uCZDV2UsTzbRf4ukx05EzswSLRDqLh1IQsSFRCmDcWGTky';

/*
  Native bcrypt runs hash/compare on libuv's thread pool, so a login does not
  stall other requests. (bcryptjs's "async" API only yields every 100ms, so
  a cost-10 hash still ran in one blocking chunk on the main thread.)
  Hashes are interchangeable with the bcryptjs ones already stored ($2a$).
  Concurrent hashes are capped by UV_THREADPOOL_SIZE (default 4).
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

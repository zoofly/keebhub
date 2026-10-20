// No changes should be required in this file

const crypto = require('crypto');
const cookieSession = require('cookie-session');
const warnings = require('../constants/warnings');

/*
  The cookie session makes it so a user can enters their username and password one time,
  and then we can keep them logged in. We do this by giving them a really long random string
  that the browser will pass back to us with every single request. The long random string is
  something the server can confirm, and then we know that we have the right user.

  You can see this string that gets passed back and forth in the
  `application` ->  `storage` -> `cookies` section of the chrome debugger
*/

const serverSessionSecret = () => {
  if (
    !process.env.SERVER_SESSION_SECRET ||
    process.env.SERVER_SESSION_SECRET.length < 32 ||
    process.env.SERVER_SESSION_SECRET === warnings.exampleBadSecret
  ) {
    // Refuse to run in production without a strong secret
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SERVER_SESSION_SECRET is missing or too weak');
    }
    // Warning if user doesn't have a good secret
    console.log(warnings.badSecret);
    // Use a random per-process secret in development instead of a guessable default
    return crypto.randomBytes(32).toString('hex');
  }

  return process.env.SERVER_SESSION_SECRET;
};

module.exports = cookieSession({
  secret: serverSessionSecret(), // please set this in your .env file
  key: 'user', // this is the name of the req.variable. 'user' is convention, but not required
  resave: 'false',
  saveUninitialized: false,
  maxAge: 60 * 60 * 1000, // Set to 1 hour - 60 min/hour * 60 s/min * 1000 ms/s
  secure: process.env.NODE_ENV === 'production', // only send the cookie over HTTPS in production
  sameSite: 'lax',
  httpOnly: true,
});

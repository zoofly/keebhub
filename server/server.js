const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security headers. CSP is off for now: the CRA build inlines its runtime
// script and listings load images from arbitrary URLs.
app.use(helmet({ contentSecurityPolicy: false }));

// Heroku terminates HTTPS at its proxy; trust it so secure cookies are sent
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const sessionMiddleware = require('./modules/session-middleware');
const passport = require('./strategies/user.strategy');

// Route includes
const userRouter = require('./routes/user.router');
const switchesRouter= require('./routes/switches.router');
const savedListings = require('./routes/savedListings.router');
const postings = require('./routes/postings.router');
const myListings = require('./routes/myListings.router');

// Body parser middleware. The client only sends JSON, so form-encoded bodies
// (the kind a cross-site HTML form can send) are not accepted.
app.use(bodyParser.json({ limit: '100kb' }));

// Passport Session Configuration //
app.use(sessionMiddleware);

// passport 0.6+ calls regenerate/save on the session, which cookie-session lacks
app.use((req, res, next) => {
  if (!req.session.regenerate) {
    req.session.regenerate = (cb) => cb();
  }
  if (!req.session.save) {
    req.session.save = (cb) => cb();
  }
  next();
});

// start up passport sessions
app.use(passport.initialize());
app.use(passport.session());

// Slow down password guessing and account spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
app.use('/api/user/login', authLimiter);
app.use('/api/user/register', authLimiter);

/* Routes */
app.use('/api/user', userRouter);
app.use('/switches', switchesRouter);
app.use('/saved', savedListings);
app.use('/market', postings);
app.use('/mylistings', myListings);


// Serve static files
app.use(express.static('build'));

// App Set //
const PORT = process.env.PORT || 5000;

/** Listen * */
app.listen(PORT, () => {
  console.log(`Listening on port: ${PORT}`);
});

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const pool = require('./modules/pool');
const sessionMiddleware = require('./modules/session-middleware');
const passport = require('./strategies/user.strategy');
const { apiNotFound, errorHandler } = require('./modules/error-handlers');

// Route includes
const userRouter = require('./routes/user.router');
const switchesRouter = require('./routes/switches.router');
const savedListings = require('./routes/savedListings.router');
const postings = require('./routes/postings.router');
const myListings = require('./routes/myListings.router');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const INDEX_HTML = path.join(BUILD_DIR, 'index.html');
const API_PREFIXES = ['/api', '/switches', '/saved', '/market', '/mylistings'];

const app = express();

// Security headers. CSP is off for now: the CRA build inlines its runtime
// script and listings load images from arbitrary URLs.
app.use(helmet({ contentSecurityPolicy: false }));

// Heroku terminates HTTPS at its proxy; trust it so secure cookies are sent
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// gzip/deflate responses (JSON and static assets) for clients that ask
app.use(compression());

// Liveness/readiness check. Registered before the session middleware so it
// never touches cookies or passport.
app.get('/healthz', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ status: 'error' });
  }
});

// Serve the React build. Registered before the session middleware so asset
// requests skip cookie parsing and the per-request user lookup.
// CRA puts content-hashed files under build/static, so those can be cached
// forever; everything else (index.html, manifest, favicon) must revalidate so
// a deploy is picked up immediately.
const setStaticCacheHeaders = (res, filePath) => {
  const relative = path.relative(BUILD_DIR, filePath);
  if (relative.startsWith(`static${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }
};
app.use(express.static(BUILD_DIR, { setHeaders: setStaticCacheHeaders }));

// Body parser middleware. The client only sends JSON, so form-encoded bodies
// (the kind a cross-site HTML form can send) are not accepted.
app.use(express.json({ limit: '100kb' }));

// Passport Session Configuration //
app.use(sessionMiddleware);

// passport 0.6+ calls regenerate/save on the session, which cookie-session lacks.
// The shims are non-enumerable: cookie-session treats a session with any
// enumerable keys as populated, so plain assignment made every anonymous
// response carry an empty `session` Set-Cookie.
const noopSessionMethod = (cb) => cb();
app.use((req, res, next) => {
  for (const method of ['regenerate', 'save']) {
    if (!req.session[method]) {
      Object.defineProperty(req.session, method, {
        value: noopSessionMethod,
        enumerable: false,
        configurable: true,
      });
    }
  }
  next();
});

// start up passport sessions
app.use(passport.initialize());
app.use(passport.session());

// Slow down password guessing and account spam.
// AUTH_RATE_LIMIT_MAX exists for load testing; leave it unset in production.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20,
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

// Unknown API routes get a JSON 404 instead of the SPA
app.use(API_PREFIXES, apiNotFound);

// SPA fallback: deep links to client routes get index.html (GET only, and
// only for clients that want HTML).
app.get('*', (req, res, next) => {
  if (!req.accepts('html')) {
    return next();
  }
  res.set('Cache-Control', 'no-cache');
  res.sendFile(INDEX_HTML, (err) => {
    if (err) {
      // No build (e.g. running only the API in development): plain 404
      next(err.code === 'ENOENT' ? undefined : err);
    }
  });
});

app.use(apiNotFound);
app.use(errorHandler);

module.exports = app;

const { STATUS_CODES } = require('http');

// JSON 404 for unknown API routes (mounted on the API prefixes only, so client
// routes still fall through to the SPA).
const apiNotFound = (req, res) => {
  res.status(404).json({ error: 'Not Found' });
};

// Postgres error classes that mean "the client sent bad data", not a server
// fault: 22xxx data exceptions (bad numeric, value too long, ...),
// 23502 not_null_violation, 23514 check_violation.
const isClientDataError = (err) =>
  typeof err.code === 'string' &&
  (err.code.startsWith('22') || err.code === '23502' || err.code === '23514');

// Central error handler: one place that decides status + logs server faults.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let status = Number(err.status || err.statusCode) || 500;
  if (status < 400 || status > 599) status = 500;
  if (status === 500 && isClientDataError(err)) status = 400;

  if (status >= 500) {
    console.error(`${req.method} ${req.originalUrl} failed:`, err);
  }

  const message =
    status < 500 && err.expose && err.message ? err.message : STATUS_CODES[status];
  res.status(status).json({ error: message });
};

module.exports = { apiNotFound, errorHandler };

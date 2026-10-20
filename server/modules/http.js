const { STATUS_CODES } = require('http');

// Error carrying an HTTP status; the message is safe to show the client.
const httpError = (status, message = STATUS_CODES[status]) =>
  Object.assign(new Error(message), { status, expose: true });

// Express 4 does not catch rejected promises from async handlers; forward
// them to the central error handler.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const MAX_INT4 = 2147483647;

// Parse a positive Postgres INTEGER id. Returns null if invalid.
const parseId = (value) => {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return id <= MAX_INT4 ? id : null;
};

// router.param('id', validateIdParam): 400 unless :id is a positive integer.
const validateIdParam = (req, res, next, value) => {
  const id = parseId(value);
  if (id === null) {
    return next(httpError(400, 'id must be a positive integer'));
  }
  req.params.id = id;
  next();
};

module.exports = { httpError, asyncHandler, parseId, validateIdParam };

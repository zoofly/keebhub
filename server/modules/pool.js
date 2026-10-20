/*
  Shared Postgres connection pool.

  Configuration (all optional):
  - DATABASE_URL     full connection string (Heroku sets this). Takes priority.
  - PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
                     standard libpq variables, read by `pg` itself when
                     DATABASE_URL is not set. PGDATABASE defaults to `keebhub`.
  - DATABASE_SSL     `true` to connect with TLS, `false` to force it off.
                     Defaults to on when running on Heroku (DYNO is set),
                     off otherwise (e.g. a local Postgres).
  - PG_POOL_MAX      max clients in the pool (default 10). Keep
                     PG_POOL_MAX x dynos below the plan's connection limit.
  - PG_IDLE_TIMEOUT_MS, PG_CONNECTION_TIMEOUT_MS, PG_STATEMENT_TIMEOUT_MS
*/

const pg = require('pg');

const intFromEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const useSsl = () => {
  if (process.env.DATABASE_SSL === 'true') return true;
  if (process.env.DATABASE_SSL === 'false') return false;
  return Boolean(process.env.DYNO);
};

const config = {
  max: intFromEnv('PG_POOL_MAX', 10),
  // how long a client may sit idle before being closed
  idleTimeoutMillis: intFromEnv('PG_IDLE_TIMEOUT_MS', 30000),
  // fail fast instead of queueing forever when the database is unreachable
  connectionTimeoutMillis: intFromEnv('PG_CONNECTION_TIMEOUT_MS', 5000),
  // stop a runaway query from holding a pool slot indefinitely
  statement_timeout: intFromEnv('PG_STATEMENT_TIMEOUT_MS', 10000),
};

if (process.env.DATABASE_URL) {
  config.connectionString = process.env.DATABASE_URL;
} else if (!process.env.PGDATABASE) {
  config.database = 'keebhub';
}

if (useSsl()) {
  // Heroku Postgres uses certificates that are not signed by a public CA
  config.ssl = { rejectUnauthorized: false };
}

// this creates the pool that will be shared by all other modules
const pool = new pg.Pool(config);

// The pool emits an error on behalf of idle clients when the backend drops
// the connection (restart, failover, network blip). pg removes the broken
// client from the pool and the next query opens a fresh one, so log it and
// keep serving instead of taking the whole dyno down.
pool.on('error', (err) => {
  console.error(
    `Postgres idle client error (code=${err.code || 'n/a'}, total=${pool.totalCount}, idle=${pool.idleCount}):`,
    err.message
  );
});

module.exports = pool;

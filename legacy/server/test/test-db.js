/*
  Test database for the route tests.

  - TEST_DATABASE_URL set: uses that real Postgres. ALL keebhub TABLES IN IT
    ARE DROPPED AND RECREATED, so point it at a throwaway database.
  - otherwise: an in-memory pg-mem database (no Postgres needed).

  The pool is injected in place of server/modules/pool.js, so this must be
  required before server/app.js.
*/
const fs = require('fs');
const path = require('path');
const Module = require('module');

const SCHEMA = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database.sql'),
  'utf8'
);

const createPool = async () => {
  if (process.env.TEST_DATABASE_URL) {
    const pg = require('pg');
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await pool.query(
      'DROP TABLE IF EXISTS saved_listings, postings, switches, "user" CASCADE'
    );
    await pool.query(SCHEMA);
    return { pool, kind: 'postgres' };
  }

  const { newDb, DataType } = require('pg-mem');
  const db = newDb();
  // pg-mem implements few built-in functions; add the ones the schema uses
  db.public.registerFunction({
    name: 'trim',
    args: [DataType.text],
    returns: DataType.text,
    implementation: (value) => (value == null ? value : value.trim()),
  });
  db.public.none(SCHEMA);
  const { Pool } = db.adapters.createPg();
  return { pool: new Pool(), kind: 'pg-mem' };
};

// Replace server/modules/pool.js in the require cache with the test pool
const injectPool = (pool) => {
  const poolPath = require.resolve('../modules/pool');
  const mod = new Module(poolPath);
  mod.filename = poolPath;
  mod.loaded = true;
  mod.exports = pool;
  require.cache[poolPath] = mod;
};

module.exports = { createPool, injectPool };

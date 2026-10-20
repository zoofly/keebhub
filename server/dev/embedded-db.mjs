// Throwaway local Postgres for reviewing / load testing keebhub without
// installing Postgres. Not used by the app and not installed by npm: copy this
// file into a scratch directory that has the packages below (see README,
// "Local Postgres without installing it").
//
//   npm install embedded-postgres@17.10.0-beta.17 bcryptjs@2.4.3
//   node embedded-db.mjs /path/to/keebhub/database.sql [--reset]
//
// Env: PGPORT (default 5432), SEED_POSTINGS (default 100), SEED_SWITCHES (30)
// Data lives in ./data next to where you run it; --reset wipes and reseeds.
// Login for the seeded user: bench / benchpassword
import EmbeddedPostgres from 'embedded-postgres';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const schemaFile = process.argv[2];
if (!schemaFile) {
  console.error('usage: node embedded-db.mjs <database.sql> [--reset]');
  process.exit(1);
}
const reset = process.argv.includes('--reset');
const port = Number(process.env.PGPORT || 5432);
const dataDir = path.resolve('data');
const nPostings = Number(process.env.SEED_POSTINGS || 100);
const nSwitches = Number(process.env.SEED_SWITCHES || 30);

if (reset) fs.rmSync(dataDir, { recursive: true, force: true });
const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  onLog: () => {},
});

if (fresh) await pg.initialise();
await pg.start();

if (fresh) {
  await pg.createDatabase('keebhub');
  const client = pg.getPgClient('keebhub');
  await client.connect();
  await client.query(fs.readFileSync(schemaFile, 'utf8'));

  // bcryptjs and native bcrypt hashes are interchangeable
  const hash = bcrypt.hashSync('benchpassword', 10);
  await client.query(
    `INSERT INTO "user" (username, password)
     SELECT 'user' || g, $1 FROM generate_series(1, 20) g`,
    [hash]
  );
  await client.query(`INSERT INTO "user" (username, password) VALUES ('bench', $1)`, [hash]);
  await client.query(
    `INSERT INTO postings (user_id, title, description, image, price)
     SELECT (g % 21) + 1,
            'Keyboard listing #' || g,
            repeat('Lubed and filmed, great condition. ', 6),
            'https://example.com/images/kb' || g || '.jpg',
            (50 + (g % 400))::numeric + 0.99
     FROM generate_series(1, $1::int) g`,
    [nPostings]
  );
  await client.query(
    `INSERT INTO switches (switch_name, image, description, switch_type, actuation_point, switch_mount)
     SELECT 'Switch ' || g,
            'https://example.com/switches/' || g || '.png',
            repeat('Smooth and consistent. ', 5),
            (ARRAY['linear','tactile','clicky'])[(g % 3) + 1],
            '2.0mm', '5-pin'
     FROM generate_series(1, $1::int) g`,
    [nSwitches]
  );
  await client.end();
  console.log(`seeded: 21 users (bench/benchpassword), ${nPostings} postings, ${nSwitches} switches`);
}

console.log(`postgres ready: postgres://postgres:postgres@localhost:${port}/keebhub (Ctrl-C to stop)`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);

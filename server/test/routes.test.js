// Route tests: `npm run test:server`
// Runs against pg-mem by default, or a real Postgres via TEST_DATABASE_URL
// (see server/test/test-db.js; that database's tables are dropped).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const { createPool, injectPool } = require('./test-db');

process.env.SERVER_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
delete process.env.AUTH_RATE_LIMIT_MAX;

let app;
let pool;
let alice; // supertest agents keep the session cookie
let bob;

const posting = (overrides = {}) => ({
  title: 'GMMK Pro',
  description: 'Lubed, filmed, great condition',
  image: 'https://example.com/gmmk.jpg',
  price: '199.99',
  ...overrides,
});

before(async () => {
  ({ pool } = await createPool());
  injectPool(pool);
  app = require('../app');

  await pool.query(
    `INSERT INTO switches (switch_name, image, description, switch_type, actuation_point, switch_mount)
     VALUES ('Gateron Yellow', 'https://example.com/y.png', 'Smooth', 'linear', '2.0mm', '5-pin'),
            ('Holy Panda', 'https://example.com/hp.png', 'Bumpy', 'tactile', '2.0mm', '3-pin')`
  );

  for (const name of ['alice', 'bob']) {
    const res = await request(app)
      .post('/api/user/register')
      .send({ username: name, password: `${name}-password` });
    assert.equal(res.status, 201);
  }
  alice = request.agent(app);
  bob = request.agent(app);
  assert.equal(
    (await alice.post('/api/user/login').send({ username: 'alice', password: 'alice-password' })).status,
    200
  );
  assert.equal(
    (await bob.post('/api/user/login').send({ username: 'bob', password: 'bob-password' })).status,
    200
  );
});

after(async () => {
  await pool.end();
});

test('GET /healthz checks the database', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('register validates input and rejects duplicate usernames', async () => {
  const bad = await request(app)
    .post('/api/user/register')
    .send({ username: 'carol', password: 'short' });
  assert.equal(bad.status, 400);

  const dup = await request(app)
    .post('/api/user/register')
    .send({ username: 'alice', password: 'another-password' });
  assert.equal(dup.status, 409);
});

test('login rejects bad credentials with 401', async () => {
  const wrong = await request(app)
    .post('/api/user/login')
    .send({ username: 'alice', password: 'not-the-password' });
  assert.equal(wrong.status, 401);

  const unknown = await request(app)
    .post('/api/user/login')
    .send({ username: 'nobody', password: 'whatever-password' });
  assert.equal(unknown.status, 401);

  const nonString = await request(app)
    .post('/api/user/login')
    .send({ username: ['alice'], password: { a: 1 } });
  assert.ok([400, 401].includes(nonString.status), String(nonString.status));
});

test('GET /api/user returns the session user without the password', async () => {
  const res = await alice.get('/api/user');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['id', 'username']);
  assert.equal(res.body.username, 'alice');
});

test('anonymous requests do not get a session cookie', async () => {
  const res = await request(app).get('/switches');
  assert.equal(res.headers['set-cookie'], undefined);
});

test('GET /switches is public and cacheable', async () => {
  const res = await request(app).get('/switches');
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=300');
  assert.equal(res.body.length, 2);
  assert.deepEqual(Object.keys(res.body[0]).sort(), [
    'actuation_point',
    'description',
    'id',
    'image',
    'switch_mount',
    'switch_name',
    'switch_type',
  ]);
});

test('market routes require login', async () => {
  assert.equal((await request(app).get('/market')).status, 403);
  assert.equal((await request(app).post('/market').send(posting())).status, 403);
  assert.equal((await request(app).get('/mylistings')).status, 403);
  assert.equal((await request(app).get('/saved')).status, 403);
});

test('POST /market validates and returns the created posting', async () => {
  for (const bad of [
    posting({ title: '  ' }),
    posting({ image: 'javascript:alert(1)' }),
    posting({ price: '-1' }),
    posting({ price: '' }),
    posting({ price: '1e20' }),
  ]) {
    const res = await alice.post('/market').send(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }

  const res = await alice.post('/market').send(posting());
  assert.equal(res.status, 201);
  assert.equal(res.body.title, 'GMMK Pro');
  assert.equal(Number(res.body.price), 199.99);
  assert.ok(Number.isInteger(res.body.id));
  assert.ok(res.body.user_id);
});

test('GET /market pages newest first and keeps an array body', async () => {
  for (const title of ['Board A', 'Board B', 'Board C']) {
    assert.equal((await bob.post('/market').send(posting({ title }))).status, 201);
  }

  const all = await alice.get('/market');
  assert.equal(all.status, 200);
  assert.ok(Array.isArray(all.body));
  assert.equal(all.body.length, 4);
  assert.equal(all.body[0].title, 'Board C');
  assert.equal(all.headers['x-next-offset'], undefined);

  const page1 = await alice.get('/market?limit=2');
  assert.deepEqual(page1.body.map((p) => p.title), ['Board C', 'Board B']);
  assert.equal(page1.headers['x-next-offset'], '2');

  const page2 = await alice.get('/market?limit=2&offset=2');
  assert.deepEqual(page2.body.map((p) => p.title), ['Board A', 'GMMK Pro']);
  assert.equal(page2.headers['x-next-offset'], undefined);

  assert.equal((await alice.get('/market?limit=abc')).status, 400);
  assert.equal((await alice.get('/market?offset=-1')).status, 400);
  assert.equal((await alice.get('/market?limit=100000')).status, 200);
});

test('PUT /market/:id is owner-only and returns the updated posting', async () => {
  const mine = (await alice.get('/mylistings')).body[0];

  assert.equal((await alice.put('/market/abc').send(posting())).status, 400);
  assert.equal((await alice.put('/market/0').send(posting())).status, 400);
  assert.equal((await alice.put('/market/99999999999').send(posting())).status, 400);
  assert.equal((await alice.put(`/market/${mine.id}`).send(posting({ price: 'x' }))).status, 400);

  const notOwner = await bob.put(`/market/${mine.id}`).send(posting({ title: 'Mine now' }));
  assert.equal(notOwner.status, 404);

  const res = await alice.put(`/market/${mine.id}`).send(posting({ title: 'GMMK Pro v2', price: 150 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.id, mine.id);
  assert.equal(res.body.title, 'GMMK Pro v2');
  assert.equal(Number(res.body.price), 150);
});

test('GET /mylistings only returns the user\'s postings', async () => {
  const res = await bob.get('/mylistings');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((p) => p.title), ['Board C', 'Board B', 'Board A']);
});

test('saved listings are scoped to the user', async () => {
  const target = (await bob.get('/mylistings')).body[0];

  assert.equal((await alice.post('/saved').send({ posting_id: 'abc' })).status, 400);
  assert.equal((await alice.post('/saved').send({ posting_id: 999999 })).status, 404);

  const saved = await alice.post('/saved').send({ posting_id: target.id });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.posting_id, target.id);

  const again = await alice.post('/saved').send({ posting_id: target.id });
  assert.ok([200, 201].includes(again.status));

  const aliceSaved = await alice.get('/saved');
  assert.equal(aliceSaved.status, 200);
  assert.equal(aliceSaved.body.length, 1);
  assert.equal(aliceSaved.body[0].title, target.title);

  assert.deepEqual((await bob.get('/saved')).body, []);

  assert.equal((await bob.delete(`/saved/${saved.body.id}`)).status, 404);
  assert.equal((await alice.delete(`/saved/${saved.body.id}`)).status, 204);
  assert.deepEqual((await alice.get('/saved')).body, []);
});

test('DELETE /market/:id is owner-only and returns 204', async () => {
  const mine = (await alice.get('/mylistings')).body[0];
  assert.equal((await alice.delete('/market/abc')).status, 400);
  assert.equal((await bob.delete(`/market/${mine.id}`)).status, 404);
  assert.equal((await alice.delete(`/market/${mine.id}`)).status, 204);
  assert.equal((await alice.delete(`/market/${mine.id}`)).status, 404);
});

test('unknown API routes return a JSON 404', async () => {
  for (const [method, url] of [
    ['get', '/api/nope'],
    ['post', '/switches'],
    ['get', '/market/1/extra'],
  ]) {
    const res = await alice[method](url).set('Accept', 'text/html');
    assert.equal(res.status, 404, `${method} ${url}`);
    assert.deepEqual(res.body, { error: 'Not Found' });
  }
});

test('malformed JSON bodies are rejected with 400', async () => {
  const res = await request(app)
    .post('/api/user/register')
    .set('Content-Type', 'application/json')
    .send('{bad');
  assert.equal(res.status, 400);
});

test('form-encoded bodies are not parsed', async () => {
  const res = await alice
    .post('/market')
    .type('form')
    .send(posting());
  assert.equal(res.status, 400);
});

// Keep last: it uses up the login rate limit for this app instance
test('login is rate limited', async () => {
  let status;
  for (let i = 0; i < 25 && status !== 429; i += 1) {
    status = (
      await request(app)
        .post('/api/user/login')
        .send({ username: 'alice', password: 'not-the-password' })
    ).status;
  }
  assert.equal(status, 429);
});

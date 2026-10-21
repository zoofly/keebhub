// Load test for keebhub (see README, "Load testing"). Not used by the app;
// copy into the same scratch directory as embedded-db.mjs and
//   npm install autocannon@7
//   node bench.mjs http://localhost:5055 [label] [seconds=15] [connections=50]
// ONLY=<regex> limits which scenarios run. Logs in as bench / $BENCH_PASSWORD.
// Start the server with AUTH_RATE_LIMIT_MAX=100000000 to measure login
// throughput instead of the rate limiter's 429s.
import autocannon from 'autocannon';

const [base, label = 'run', dur = '15', conns = '50'] = process.argv.slice(2);
if (!base) {
  console.error('usage: node bench.mjs <baseUrl> [label] [seconds] [connections]');
  process.exit(1);
}
const duration = Number(dur);
const connections = Number(conns);
if (!process.env.BENCH_PASSWORD) {
  console.error('set BENCH_PASSWORD to the one embedded-db.mjs seeded');
  process.exit(1);
}
const creds = JSON.stringify({ username: 'bench', password: process.env.BENCH_PASSWORD });
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const login = await fetch(`${base}/api/user/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: creds,
});
if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');

const loginRequest = {
  url: `${base}/api/user/login`,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: creds,
};

const report = (scenario, r) => {
  const statuses = Object.entries(r.statusCodeStats || {})
    .map(([k, v]) => `${k}:${v.count}`)
    .join(' ');
  console.log(
    JSON.stringify({
      label,
      scenario,
      reqPerSec: r.requests.average,
      p50: r.latency.p50,
      p99: r.latency.p99,
      bytesPerReq: Math.round(r.throughput.total / Math.max(1, r.requests.total)),
      total: r.requests.total,
      errors: r.errors,
      timeouts: r.timeouts,
      statuses,
    })
  );
};

const scenarios = [
  { name: 'GET /market', url: `${base}/market`, headers: { cookie } },
  {
    name: 'GET /market (gzip)',
    url: `${base}/market`,
    headers: { cookie, 'accept-encoding': 'gzip' },
  },
  { name: 'GET /switches', url: `${base}/switches` },
  { name: 'POST /api/user/login', ...loginRequest },
];

for (const { name, ...opts } of scenarios) {
  if (only && !only.test(name)) continue;
  report(name, await autocannon({ ...opts, duration, connections }));
}

// Login flood (20 conns) while measuring /switches (20 conns): shows whether
// password hashing stalls unrelated requests.
if (!only || only.test('mixed')) {
  const [a, b] = await Promise.all([
    autocannon({ ...loginRequest, duration, connections: 20 }),
    autocannon({ url: `${base}/switches`, duration, connections: 20 }),
  ]);
  report('mixed: login', a);
  report('mixed: /switches during login load', b);
}

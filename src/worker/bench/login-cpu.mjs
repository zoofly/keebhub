// Local CPU benchmark for the password paths (login, register, password
// change), done locally until a production deploy can report real cpuTime.
//
//   npm run build && node src/worker/bench/login-cpu.mjs [iterations=40]
//
// Runs the built Worker (dist/keebhub/index.js) in workerd via Miniflare with
// a throwaway local D1 and outbound fetches answered locally (Turnstile always
// passes, HIBP finds nothing), so nothing touches the network. Requests are
// sent one at a time, so wall time per request ~= CPU time + local D1 I/O.
// Compare with GET /api/health to see the cost of the password derivation.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import path from "node:path";
import { readD1Migrations } from "@cloudflare/vitest-plugin";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const N = Number(process.argv[2] ?? 40);
const root = path.resolve(import.meta.dirname, "../../..");
const ORIGIN = "https://keebhub.bench";
// The Turnstile action the next request's token was issued for.
let turnstileAction = "login";

const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: path.join(root, "dist/keebhub/index.js"),
    compatibilityDate: "2026-10-12",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "bench-db" },
    bindings: {
      // Random per run; Turnstile and HIBP are answered locally below.
      PASSWORD_PEPPER_V1: randomBytes(32).toString("base64"),
      TURNSTILE_SECRET_KEY: randomBytes(16).toString("hex"),
      TURNSTILE_SITE_KEY: "unused",
    },
    outboundService: async (request) => {
      if (request.url.includes("siteverify")) {
        return Response.json({
          success: true,
          hostname: new URL(ORIGIN).hostname,
          action: turnstileAction,
        });
      }
      return new Response("0000000000000000000000000000000000A:0\r\n");
    },
  }),
);

const db = await mf.getD1Database("DB");
for (const migration of await readD1Migrations(path.join(root, "migrations"))) {
  await db.batch(migration.queries.map((q) => db.prepare(q)));
}

let ipCounter = 0;
const nextIp = () => {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
};
const call = (pathname, body, { ip = nextIp(), cookie } = {}) => {
  turnstileAction = pathname.endsWith("/register") ? "register" : "login";
  const headers = body
    ? { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": ip }
    : { "cf-connecting-ip": ip };
  if (cookie) {
    headers.cookie = cookie;
  }
  return mf.dispatchFetch(`${ORIGIN}${pathname}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
};

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function measure(label, fn) {
  await fn(-1); // warm-up
  const times = [];
  for (let i = 0; i < N; i += 1) {
    const start = performance.now();
    const res = await fn(i);
    times.push(performance.now() - start);
    await res?.arrayBuffer?.();
  }
  const fmt = (v) => v.toFixed(1).padStart(6);
  console.log(
    `${label.padEnd(44)} p50 ${fmt(percentile(times, 50))} ms  p95 ${fmt(percentile(times, 95))} ms`,
  );
}

// A random password per run.
const password = randomBytes(12).toString("base64url");
const register = await call("/api/auth/register", {
  username: "bencher",
  password,
  turnstileToken: "x",
});
if (register.status !== 201) {
  throw new Error(`register failed: ${register.status} ${await register.text()}`);
}
const cookie = (register.headers.get("set-cookie") ?? "").split(";")[0];
const otherPassword = randomBytes(12).toString("base64url");

console.log(
  `n=${N}, sequential requests, Node ${process.version}, ${process.platform}/${process.arch}\n`,
);
await measure("node:crypto pbkdf2Sync sha256 50k (native)", () => {
  pbkdf2Sync(password, "0123456789abcdef", 50_000, 32, "sha256");
});
await measure("workerd GET /api/health (baseline)", () => call("/api/health"));
await measure("workerd POST /api/auth/login (success)", () =>
  call("/api/auth/login", { username: "bencher", password, turnstileToken: "x" }),
);
await measure("workerd POST /api/auth/login (unknown user)", (i) =>
  call("/api/auth/login", { username: `nobody${i + 1}`, password, turnstileToken: "x" }),
);
await measure("workerd POST /api/auth/register", (i) =>
  call("/api/auth/register", { username: `bencher${i + 2}`, password, turnstileToken: "x" }),
);
// Verifies the current password and hashes the new one: two derivations.
// Alternates between two passwords so every call succeeds.
await measure("workerd POST /api/auth/password (change)", async (i) => {
  const [from, to] = (i + 1) % 2 === 0 ? [password, otherPassword] : [otherPassword, password];
  const res = await call(
    "/api/auth/password",
    { currentPassword: from, newPassword: to },
    { ip: "198.51.100.250", cookie },
  );
  if (res.status !== 204) {
    throw new Error(`password change failed: ${res.status} ${await res.text()}`);
  }
  return res;
});

await mf.dispose();

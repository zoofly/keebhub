# keebhub modernization plan: Cloudflare free tier

> ## Decisions and amendments (2026-10-20, after senior review)
>
> **Kash's decisions**
> - **Sign-in:** password now. Passkeys (B5/F5) are deferred to a later round. Image uploads (B6) are also deferred.
> - **Defaults until Kash says otherwise:**
>   - The market (list and detail) can be browsed **logged out**. Posting, editing, deleting and saving need login.
>   - Sessions last **7 days sliding, with a 30-day absolute cap**. They're stored server-side in D1 and can be revoked.
>   - Seed the switch catalog with about **20 well-known switches** (name, type, manufacturer; no images).
>   - Host on **workers.dev**, with no custom domain.
> - **Passwords use PBKDF2 at 50k iterations** (2026-10-25, before launch), not the workerd maximum of 100k, so every path including a password change fits the 10 ms CPU limit; the pepper carries the protection against a database-only leak (§4).
> - **No deploys or Cloudflare resource creation by agents.** Use local D1 and workerd only (`vite dev`, `vite preview`, vitest pool). Kash approves the first real deploy, `wrangler d1 create`, the secrets and the Turnstile widget. Until then, Phase 0's exit check is `/api/health` passing locally, and `database_id` stays a placeholder.
>
> **Lessons from the legacy review (must carry forward)**
> - Every error path returns JSON `{error}`, including rate-limit, auth-failure, 404, 413 and 415 responses.
> - Usernames are normalized: case-insensitive uniqueness, an allowed-character rule and trimming, all in `src/shared`.
> - Prices are bounded and strictly decimal: reject `"0x10"`, exponents and anything over 99,999,999.99. Store them as integer cents.
> - Paging is cursor-based, with a real "Load more" UI. No silent cap.
> - Install exactly the way you deploy: `npm ci` with **no `--legacy-peer-deps`**, Node pinned in `.nvmrc` and `engines`.
> - Enforce a CSP before cutover. Allow `https:` images only; no `http:` and no mixed content.
> - Clear all client state (TanStack Query cache) on logout.
> - Don't ship source maps to production.
> - The legacy acceptance flows in `docs/legacy-acceptance/e2e-legacy.js` (18 flows × 1280px and 375px) are the behavioral spec for the QA track's Playwright suite.


Owner: Kash (zoofly/keebhub) · Drafted 2026-10-20 · Status: proposal, nothing built yet

Kash's decision is the starting point: everything runs on Cloudflare's free tier, with no payment card if possible. The API moves to Workers + Hono and the data moves to D1. This document decides the rest.

---

## 1. Summary

### Target stack

| Concern | Choice | Why | Cost |
|---|---|---|---|
| Hosting | **One Worker that serves the SPA as static assets and the API at `/api/*`** (not Pages). Config: `assets.not_found_handling: "single-page-application"` and `run_worker_first: ["/api/*"]` | Same origin, so no CORS and simple cookies. One deploy and one config file. Static asset requests are free and unlimited, and Pages has no feature this app needs | $0 |
| API | **Hono 4** on Workers, typed `Bindings`, Hono RPC (`hc`) client | Small and fast, built for Workers, with built-in `secureHeaders` and `bodyLimit`. RPC gives the SPA end-to-end types without codegen | $0 |
| Database | **D1**, with **raw SQL migrations** applied by `wrangler d1 migrations apply` and a thin typed query module | 4–6 tables and about 15 queries don't justify an ORM. Drizzle is still 0.45 with 1.0 at RC stage, so it would bring churn. Kash reads SQL fluently, and reviewable `.sql` files suit her IaC habits | $0 |
| Validation | **zod 4** schemas in `src/shared/`, used by Hono (`@hono/zod-validator`) and by forms (`@hookform/resolvers`) | One source of truth for the limits that are currently copied by hand between `postings.router.js` and `utils/validation.js` | $0 |
| Auth | **Hand-rolled D1 session table** following Lucia's published `auth_session.ts` pattern. **Passwords use PBKDF2-HMAC-SHA256 at 50k iterations plus a secret pepper.** Turnstile protects register and login. **Passkeys are added later** with `@simplewebauthn/server`, the same library as KeyPass | The 10 ms free-plan CPU budget rules out bcrypt, scrypt, and Better Auth's default hasher (see §2). This is about 150 lines Kash can own and reuse in KeyPass | $0 |
| Rate limiting | **D1 throttle table** (per username and per IP, authoritative) plus the **Workers Rate Limiting binding** as a coarse per-IP guard if it deploys on Free | The binding is per-location and eventually consistent, and its Free-plan availability isn't documented. D1 is exact | $0 |
| Bot protection | **Turnstile** on register and login | Free with unlimited challenges, no card. It also keeps bots from using up the 100k writes/day D1 budget | $0 |
| Images | **Keep pasted image URLs, now https-only** and validated. Optional later: **KV uploads** (≤1 MB, re-encoded in the browser) | R2 needs a subscription checkout, and Cloudflare Images storage is paid-only. KV is free and needs no card | $0 |
| Map | **Drop it.** If ever wanted: MapLibre GL + OpenFreeMap (no key) | Today it's an unmarked map of Minneapolis, and listings have no location. Google needs a billing account | $0 |
| Frontend build | **Vite 8 + `@cloudflare/vite-plugin`**, React **19**, TypeScript | CRA is dead. The plugin runs the Worker and the SPA together in `vite dev` on the real workerd runtime | $0 |
| Routing | **React Router v8, data mode** (`createBrowserRouter`), SPA only | v8 is current (released 2026-06). Kash already knows React Router. Loaders give clean auth redirects. Framework/SSR mode adds complexity for no gain | $0 |
| Server state | **TanStack Query v5.** Remove Redux, redux-saga, redux-logger, and axios | Every piece of Redux state today is server state. RTK Query would keep Redux around for nothing | $0 |
| UI | **Tailwind CSS v4 + shadcn/ui** (Radix primitives), self-hosted font via `@fontsource`. Remove MUI v4 and sweetalert | Accessible primitives, and the component code lives in the repo. Static CSS allows a strict `style-src 'self'` CSP, while MUI's emotion runtime injects `<style>` tags and would need nonces. MUI v4 to v9 is a full rewrite either way | $0 |
| Forms | react-hook-form + zod resolver | shadcn's standard form pattern | $0 |
| Lint/format | **Biome 2** (one tool for lint and format; replaces Prettier) | One dependency and one config, fast. typescript-eslint doesn't support TypeScript 7 yet (peer `<6.1`) | $0 |
| Types | TypeScript **strict** (+ `noUncheckedIndexedAccess`). TS 7.0 (native `tsc`); fall back to 6.0.3 if any tool breaks | Nothing in this toolchain needs the TS JS API once ESLint is gone | $0 |
| Tests | **Vitest** with **`@cloudflare/vitest-plugin` 1.x** for the API (it was `@cloudflare/vitest-pool-workers`, renamed 2026-08), Vitest + Testing Library + jsdom for components, **MSW** for frontend dev/tests, **Playwright** + `@axe-core/playwright` for e2e | Tests run in real workerd against local D1 | $0 |
| CI/CD | GitHub Actions: Biome, typecheck, unit, e2e, `npm audit`, deploy with `cloudflare/wrangler-action` and a scoped API token. **Dependabot** (already enabled on the repo) | Fits what's already set up | $0 (public repo) |
| Node | `.nvmrc` = `24` (LTS); `engines.node >=22.22` (React Router v8 minimum); move to 26 after it becomes LTS on 2026-10-28 | | |
| IaC | **No Terraform for v1.** `wrangler.jsonc` is already declarative IaC for the Worker and its bindings. Optional later for account-level resources (see §6) | Terraform would fight `wrangler deploy` over the same resources, and free remote state options are poor | $0 |

### What changes for users

- URLs become real paths (`/market`, not `/#/market`). The API moves under `/api/*` so it no longer collides with SPA routes, since today both use `/market` and `/mylistings`.
- Price is stored as integer cents. JSON switches to camelCase.
- Saved listings get a real UI. The backend already supports them, but `SavedListings.jsx` is an empty stub.
- The map goes away.

---

## 2. Verified constraints

All facts checked 2026-10-20 against the linked docs or source.

| # | Constraint | What it means for us | Source |
|---|---|---|---|
| C1 | **Workers Free: 10 ms CPU per request**, 128 MB memory, 100,000 requests/day (Error 1027 when exceeded, resets at 00:00 UTC), 50 subrequests, 5 Cron Triggers/account. Waiting on the network or on D1 doesn't count as CPU. Occasional overruns are tolerated ("some built-in flexibility") | Password hashing is the only CPU-heavy work. Everything else is I/O-bound | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| C2 | **Web Crypto PBKDF2 is capped at 100,000 iterations** in workerd (`DEFAULT_MAX_PBKDF2_ITERATIONS = 100'000`, which throws `NotSupportedError` above it). **scrypt** via `node:crypto` is allowed up to N·r·p ≤ 2^20. `argon2` is **not** supported in `node:crypto` on Workers | OWASP asks for 600k iterations of PBKDF2-SHA256, so we can't reach that. We compensate with a pepper, and later with passkeys | [workerd limit-enforcer.h](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/limit-enforcer.h), [pbkdf2.c++](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto/pbkdf2.c%2B%2B), [node:crypto on Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/), [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| C3 | **Measured hash cost** (native code, Apple M5, Node 26): PBKDF2-SHA256 100k = **7.0 ms**; PBKDF2-SHA512 100k = 17.7 ms; scrypt N=2^13,r=8 = 10.8 ms; scrypt N=2^14,r=8 = 21.8 ms; scrypt at OWASP N=2^17 = 181 ms. bcryptjs cost 10 runs in pure JS and is far slower | Only **PBKDF2-SHA256 at ≤100k** fits about 10 ms. Cloudflare's server cores are probably slower per thread than an M5, so **measure `cpuTime` after deploying**. JS-only hashers (bcryptjs, `@noble` scrypt, which Better Auth uses by default) exceed the budget, and a community report confirms Better Auth hits CPU-limit errors on Workers | local benchmark (`crypto.pbkdf2Sync` / `scryptSync`); [community report](https://news.hada.io/topic?id=27399) |
| C4 | **D1 Free:** 10 DBs, 500 MB per DB, 5 GB per account, **5M rows read/day, 100k rows written/day** (when exceeded, *all* queries error until 00:00 UTC), 50 queries per invocation, 100 bound params, 2 MB per row. **Foreign keys are enforced by default.** **Time Travel point-in-time restore covers 7 days on Free**, always on, at no cost | Plenty for this app. **Daily-limit exhaustion is a free-tier DoS vector**, so throttling and Turnstile must run *before* any D1 write. We get free backups | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [FKs](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) |
| C5 | **R2 requires "the checkout flow to add an R2 subscription"**, even though usage within the free allowance is free. Community guides say the checkout asks for a payment method. **Cloudflare Images storage is Paid-plan only.** The Images free plan covers only 5,000 transformations/month | R2 breaks the no-card goal, so it's ruled out | [R2 get started](https://developers.cloudflare.com/r2/get-started/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Images pricing](https://developers.cloudflare.com/images/pricing/) |
| C6 | **KV Free:** 100k reads/day, **1,000 writes/day**, 1 GB storage, 25 MiB per value, 1 write per second per key | Enough for optional image uploads (at most 1,000 uploads/day). Too few writes for rate-limit counters | [KV limits](https://developers.cloudflare.com/kv/platform/limits/) |
| C7 | **Rate Limiting binding** is GA (2025-09-19). Periods are 10 or 60 seconds. It's "permissive, eventually consistent", with a separate limit per Cloudflare location. **Free-plan availability isn't stated** anywhere | Use it as a coarse extra layer only. The authoritative throttle lives in D1 | [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [GA changelog](https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/) |
| C8 | **Static assets:** requests are free and unlimited. 20,000 files and 25 MiB per file on Free. A `_headers` file applies **only to asset responses, not to responses generated by the Worker** (max 100 rules) | CSP and other headers for `index.html` and JS go in `_headers`. API headers come from Hono's `secureHeaders` | [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [`_headers`](https://developers.cloudflare.com/workers/static-assets/headers/), [run_worker_first](https://developers.cloudflare.com/workers/static-assets/binding/) |
| C9 | **Vite plugin layout:** `main: ./worker/index.ts` and `assets.not_found_handling: single-page-application` with `run_worker_first: ["/api/*"]`. `vite build` emits the client, the Worker, and an output `wrangler.json` that `wrangler deploy` picks up | This is the single-package layout we use | [Vite plugin tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) |
| C10 | **Turnstile** is free with unlimited challenges and 20 widgets. CSP needs `script-src` and `frame-src https://challenges.cloudflare.com` | | [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/), [Turnstile CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/) |
| C11 | **OSM tile servers** require attribution and a valid Referer, have no SLA, and ban prefetch and offline use. **OpenFreeMap** needs no key and no registration, has no view limits, and allows commercial use with attribution | If a map ever comes back, use OpenFreeMap with MapLibre | [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/), [OpenFreeMap](https://openfreemap.org/) |
| C12 | **React Router v8** (2026-06-17) needs react ≥19.2.7 and node ≥22.22. `react-router-dom` has been removed (import from `react-router` / `react-router/dom`). Data and declarative modes don't need the Vite plugin | | [RR upgrade guide](https://reactrouter.com/upgrading/v7) |
| C13 | **`@cloudflare/vitest-pool-workers` was renamed `@cloudflare/vitest-plugin`** at v1 (2026-08-19), same API. The current 1.4.x supports vitest `^4.1 \|\| ^5` and gives isolated storage per test file | | [changelog](https://developers.cloudflare.com/changelog/post/2026-08-19-vitest-plugin/), [migration](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/) |
| C14 | **Hono `csrf()`** only checks unsafe methods with *form-like* content types (urlencoded, multipart, text/plain), comparing Origin or `Sec-Fetch-Site` | It doesn't cover JSON requests on its own, so we add our own Origin check (§4) | [Hono CSRF](https://hono.dev/docs/middleware/builtin/csrf), [secureHeaders](https://hono.dev/docs/middleware/builtin/secure-headers) |
| C15 | **Lucia was deprecated in March 2025.** Its maintainers now publish `auth_session.ts` as a copy-in reference instead of a library | This supports a small, hand-rolled session module | [lucia-auth.com](https://lucia-auth.com/) |

Not verified, so check on the first deploy:

- Whether the Rate Limiting binding deploys on a Free account.
- Whether D1 accepts `STRICT` tables. SQLite ≥3.37 supports them; run `wrangler d1 execute --local` and `--remote` to confirm.
- The real `cpuTime` of a login in production (Workers Observability or `wrangler tail`).

---

## 3. Architecture

```
                          https://keebhub.<acct>.workers.dev  (custom domain optional)
                                            |
                              Cloudflare edge (one Worker: "keebhub")
          +---------------------------------+----------------------------------------+
          |  Static assets (dist/client)    |  Worker code (dist/keebhub) — Hono     |
          |  index.html, JS, CSS, fonts     |  run_worker_first: ["/api/*"]          |
          |  _headers -> CSP, HSTS, etc.    |                                        |
          |  SPA fallback for /market,      |  /api/health                           |
          |  /mylistings, /saved, ...       |  /api/auth/*   (sessions, Turnstile)   |
          |  free + unlimited, no Worker    |  /api/switches /api/postings /api/me/* |
          |  invocation                     |  middleware: secureHeaders, bodyLimit, |
          +---------------------------------+  json-only, origin check, session,     |
                                            |  rate limit, onError                   |
                                            +----+-------------+------------+-------+
                                                 |             |            |
                                         D1 "keebhub-db"   RATE_LIMITER   (later) KV "IMAGES"
                                         users, sessions,  binding (if    optional uploads
                                         postings, saved,  on Free)
                                         switches, auth_throttle,
                                         (later) passkeys
                                                 |
                              Cron Trigger (daily): delete expired sessions/throttle rows
External (browser-side only): challenges.cloudflare.com (Turnstile), user-supplied https image URLs.
External (Worker-side): Turnstile siteverify, HIBP Pwned Passwords range API (k-anonymity).
```

### Repo layout

This is a single package and a single Worker, which is simpler than workspaces. It follows Cloudflare's Vite plugin template.

```
keebhub/
  .github/
    workflows/ci.yml            # lint, typecheck, unit, e2e, audit; deploy on main
    dependabot.yml
  .nvmrc                        # 24
  biome.json
  package.json                  # engines.node, scripts (dev, build, test, e2e, db:*)
  wrangler.jsonc                # Worker + assets + D1 + ratelimits + vars + triggers
  vite.config.ts                # react(), tailwindcss(), cloudflare()
  vitest.config.ts              # projects: "worker" (cloudflareTest) + "client" (jsdom)
  playwright.config.ts          # webServer: build + vite preview (workerd + local D1)
  tsconfig.json                 # references app / worker / node
  tsconfig.app.json  tsconfig.worker.json  tsconfig.node.json
  worker-configuration.d.ts     # generated by `wrangler types` (Env bindings)
  migrations/
    0001_init.sql               # users, sessions, postings, saved_listings, switches, auth_throttle
    0002_seed_switches.sql
  public/
    _headers                    # CSP + security headers for static assets
    favicon.ico  robots.txt
  src/
    shared/                     # imported by BOTH sides; no DOM or Worker APIs
      schemas.ts                # zod: Username, Password, PostingInput, Cursor, ...
      limits.ts                 # TITLE_MAX=200, DESCRIPTION_MAX=5000, PRICE_MAX_CENTS, ...
      money.ts                  # "199.99" <-> 19999 cents, formatPrice
    worker/
      index.ts                  # Hono app, export type AppType, scheduled() handler
      env.ts                    # typed Bindings/Variables
      middleware/               # session.ts, origin.ts, jsonOnly.ts, rateLimit.ts, errors.ts
      auth/                     # password.ts (pbkdf2+pepper), session.ts, turnstile.ts, hibp.ts
      routes/                   # auth.ts, switches.ts, postings.ts, me.ts
      db/                       # users.ts, sessions.ts, postings.ts, saved.ts, throttle.ts (typed SQL)
      test/                     # *.test.ts run in workerd with migrations applied
    client/
      main.tsx  router.tsx  queryClient.ts  api.ts (hc<AppType>)
      components/ui/            # shadcn-generated (button, card, form, input, alert-dialog, sonner...)
      components/               # Layout, Nav, Footer, SkipLink, ListingCard, ListingForm, StatusMessage
      routes/                   # home, about, login, register, market, create, edit.$id, mylistings, saved, profile, not-found
      mocks/                    # MSW handlers built from shared schemas (dev + tests)
      styles.css                # @import "tailwindcss"; @theme tokens (port of theme.js purple palette)
  e2e/                          # Playwright specs
```

Removed at cutover: `server/`, CRA `src/` JS files, `public/index.html` (replaced by Vite's `index.html`), Postman JSONs, `database.sql` (replaced by `migrations/`), and the Heroku keys in `package.json`.

### wrangler.jsonc (shape)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "keebhub",
  "main": "./src/worker/index.ts",
  "compatibility_date": "2026-10-01",           // >= 2026-08-04 enables nodejs_compat by default
  "assets": {
    "directory": "./dist/client",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [{ "binding": "DB", "database_name": "keebhub-db", "database_id": "<from wrangler d1 create>", "migrations_dir": "migrations" }],
  "ratelimits": [{ "name": "AUTH_LIMITER", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } }],
  "triggers": { "crons": ["17 3 * * *"] },
  "vars": { "TURNSTILE_SITE_KEY": "<public>" },
  "observability": { "enabled": true }
  // secrets (wrangler secret put): PASSWORD_PEPPER_V1, TURNSTILE_SECRET_KEY
}
```

### API (mirrors today's routes, moved under `/api`)

| Today (Express) | New (Hono) | Auth | Notes |
|---|---|---|---|
| `GET /healthz` | `GET /api/health` | – | `SELECT 1`, `no-store` |
| `POST /api/user/register` | `POST /api/auth/register` | – | `{username, password, turnstileToken}` returns 201 `{user}` and **signs the user in**; 409 if the name is taken |
| `POST /api/user/login` | `POST /api/auth/login` | – | 200 `{user}`, 401 for bad credentials, 429 when throttled |
| `POST /api/user/logout` | `POST /api/auth/logout` | session | 204; deletes the session row and clears the cookie |
| `GET /api/user` | `GET /api/auth/me` | session | 200 `{id, username}`, otherwise 401 (today it's 403) |
| `GET /switches` | `GET /api/switches` | public | `Cache-Control: public, max-age=300` |
| `GET /market?limit&offset` | `GET /api/postings?limit&cursor` | session | **keyset** pagination: `{items, nextCursor}` |
| – | `GET /api/postings/:id` | session | new; used by the edit page |
| `POST /market` | `POST /api/postings` | session | 201 |
| `PUT /market/:id` | `PUT /api/postings/:id` | owner | 404 if not the owner (no existence leak) |
| `DELETE /market/:id` | `DELETE /api/postings/:id` | owner | 204 / 404 |
| `GET /mylistings` | `GET /api/me/postings` | session | |
| `GET /saved` | `GET /api/me/saved` | session | joined with postings |
| `POST /saved {posting_id}` | `PUT /api/me/saved/:postingId` | session | idempotent: 201 on create, 200 if it already exists, 404 if there's no such posting |
| `DELETE /saved/:id` | `DELETE /api/me/saved/:postingId` | session | keyed by posting, which is simpler for the UI |
| – | `POST /api/auth/password`, `DELETE /api/me` | session | Phase B4: change password (revokes other sessions), delete account |
| – | `/api/auth/passkey/*` | – | Phase B5 (optional) |

Errors always use `{ "error": { "code": "validation_failed" | "unauthorized" | "not_found" | "conflict" | "rate_limited" | "internal", "message": "...", "fields"?: {...} } }`. One `app.onError` maps `HTTPException`, zod issues (400), and SQLite `UNIQUE`/`CHECK` failures (409/400). Only 5xx responses get logged, with method, path, and `cf-ray`, and never the body. `app.notFound` returns a JSON 404 for `/api/*`.

### D1 schema (`migrations/0001_init.sql`, sketch)

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(username)) BETWEEN 1 AND 80),
  password_hash TEXT,                          -- PHC-style string; NULL once passkey-only (B5)
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,                -- random id (public part of token)
  secret_hash BLOB NOT NULL,                   -- SHA-256 of secret part; raw token never stored
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL                 -- sliding; absolute cap enforced in code
) STRICT;
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE postings (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  image_url   TEXT NOT NULL CHECK (length(image_url) <= 2048 AND image_url LIKE 'https://%'),
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 9999999999),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX postings_user_id_id_idx ON postings(user_id, id DESC);

CREATE TABLE saved_listings (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  posting_id INTEGER NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, posting_id)
) STRICT;
CREATE INDEX saved_listings_posting_id_idx ON saved_listings(posting_id);

CREATE TABLE switches ( ... same columns as database.sql, TEXT + CHECKs ... ) STRICT;

CREATE TABLE auth_throttle (
  key          TEXT PRIMARY KEY,               -- 'login:user:<lower(username)>' | 'login:ip:<ip>' | 'register:ip:<ip>'
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER
) STRICT;
```

Notes:

- `LIKE` is case-insensitive in SQLite, so `'https://%'` also matches `HTTPS://`. zod does the exact `new URL()` protocol check.
- The CHECKs are a backstop. zod is the primary validation.
- Timestamps are unix seconds in the database and ISO strings in JSON.

Query module rules:

- Only `env.DB.prepare(sql).bind(...)` with `?` placeholders. Never build SQL with string interpolation (a Biome rule or grep check in CI enforces this).
- Owner checks live in the SQL itself (`WHERE id = ? AND user_id = ?`), as they do today.
- Multi-statement writes use `env.DB.batch()`, which is atomic.

---

## 4. Security design

### Passwords (Phase B2)

The algorithm is **PBKDF2-HMAC-SHA256, 50,000 iterations**, with a 16-byte random salt and 32-byte output, run through Web Crypto `deriveBits`.

**Why 50k, not the workerd maximum of 100k** (Kash's decision, 2026-10-25, before launch):

- Every request must fit the Free plan's 10 ms CPU limit. A password change derives twice (verify the current password, hash the new one), which measured about 12 ms locally at 100k, before accounting for Cloudflare's slower cores.
- The pepper is the main defence against a database-only leak: without the Worker secret the hashes can't be attacked at any iteration count. Iterations only matter if the pepper leaks too.
- There are no users yet, so the change costs nothing. Each hash records its iteration count, so it can be raised later (hashes are upgraded on the next login).

**Pepper (pre-hash):** `input = HMAC-SHA256(key = PASSWORD_PEPPER_V1, msg = NFC(password))`.

- The pepper is a 32-byte random value stored as a Worker **secret**, never in D1.
- If someone dumps D1 without also getting the Worker secrets, the hashes can't be cracked.
- OWASP lists peppering as defense in depth. Here it partly makes up for running 50k iterations instead of 600k.

**Stored format:** `$pbkdf2-sha256$v=1$i=50000$p=1$<salt b64>$<hash b64>`. `p` is the pepper version. Storing algorithm, cost, and pepper version with each hash means we can raise the cost, rotate the pepper, or move to passkeys later, rehashing on the next login.

**Verification:**

- Compare with `crypto.subtle.timingSafeEqual`.
- For unknown usernames, still run one derivation against a fixed dummy hash so response time doesn't reveal which usernames exist. The current `DUMMY_HASH` logic already does this.

**Password policy (ASVS L1):**

- Length 8–128 characters. Printable Unicode is allowed and NFC-normalized, and no composition rules are imposed.
- The bcrypt-era 72-byte cap goes away, which is an improvement. The new 128-character cap bounds hashing cost.
- Reject passwords found in **Have I Been Pwned's Pwned Passwords** range API. It uses k-anonymity (only the first 5 hex characters of SHA-1 leave the Worker), needs no key, and costs one subrequest. If the API is unreachable, fail open.

**CPU budget check (exit criterion for B2):**

- Deploy, run 50 logins, and read `cpuTime` in Workers Observability or `wrangler tail`.
- Include password changes, which derive twice. If the p95 is over about 10 ms, or any Error 1102 (CPU exceeded) shows up at 50k, go **passkey-first** (Phase B5) and make passwords optional.
- Kash should decide whether passkeys are optional or the primary sign-in (§7).

### Sessions (Lucia `auth_session.ts` pattern)

- **Token:** `<id>.<secret>`, where each part is 120 bits from `crypto.getRandomValues`, base32-lowercase.
  - D1 stores `id` and `SHA-256(secret)`. Validation looks up the row by `id` and compares `timingSafeEqual(sha256(secret), secret_hash)`.
  - A leaked database or log line can't be replayed, and nothing slow is needed because the secret is high-entropy.
- **Cookie:** `__Host-keebhub_session=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=<seconds>`.
  - The `__Host-` prefix forces Secure, Path=/, and no Domain, so subdomains can't plant cookies.
  - For local dev over http: wrangler dev runs on `http://localhost`, and browsers treat localhost as a secure context, so `__Host-`/Secure works there. If it doesn't, use the plain cookie name only when `ENVIRONMENT=dev`.
- **Lifetime:**
  - Sliding expiry: 7 days idle, absolute maximum 30 days from `created_at`.
  - The expiry is extended only when less than half the window is left, so most requests cost one row read and zero writes.
  - Today's cookie-session lasts 1 hour. 7 days is a deliberate UX choice for a marketplace; Kash should confirm it (§7).
- **Rotation and revocation:**
  - A new session is created on every login and register (prevents fixation).
  - Logout deletes the row.
  - A password change deletes all of that user's sessions except the current one.
  - Account deletion cascades.
  - A daily Cron Trigger purges expired rows.
- **Exposure:** the session middleware sets `c.var.user = {id, username}`. The password hash never leaves `db/users.ts`.

### CSRF stance: no tokens; four layers

1. `SameSite=Lax` on the session cookie. Cross-site POST, PUT, and DELETE requests don't carry it.
2. **JSON-only:** every unsafe `/api/*` request must have `Content-Type: application/json`, or it gets a 415. HTML forms can't send that content type cross-site without a CORS preflight, and we never answer preflights.
3. **Origin check** middleware on all unsafe methods: allow if `Sec-Fetch-Site` is `same-origin`, or if `Origin` equals the request's own origin. Otherwise return 403. This is about 15 lines and also covers JSON requests, which Hono's `csrf()` doesn't (C14).
4. **No CORS middleware at all.** Everything is same-origin, so other origins can't read API responses.

### Rate limiting and abuse

| Layer | Where | Rule |
|---|---|---|
| Turnstile | register, login (managed or invisible widget, `data-action` = `register` / `login`) | Token verified server-side through `siteverify` **before** any D1 write: `success`, the reply's `hostname` must equal the request's host, and its `action` must match the form, so a token from another site or the other form is refused. Test-key results (`metadata.result_with_testing_key`) are accepted only on localhost. Tests mock siteverify; e2e uses Cloudflare's always-pass test keys on localhost |
| Rate Limiting binding (if available on Free) | login, register, password change, keyed on `cf-connecting-ip` (IPv6 by /64) | 10 per 60 s per location; returns 429 with `Retry-After` |
| D1 `auth_throttle` | login | Per username **+ IP** (IPv6 by /64): 10 failures in 15 min lock that pair for 15 min, so a lockout can't be weaponized against someone else; success clears it. Per username from any IP: a backstop of 100 failures an hour (15 min lock). Per IP: 30 failures in 15 min. *(Pre-launch review, 2026-10-25: the lock was per username only, which let anyone lock any account.)* |
| D1 `auth_throttle` | password change, account delete | Per session: 5 wrong passwords in 15 min lock both forms for that session. Separate from login, so a login lockout never blocks them |
| D1 `auth_throttle` | register | 5 per IP per hour |
| Global | Hono `bodyLimit` | 100 KB, same as today |

This preserves today's "20 per 15 min" intent, and it's stricter because it's per username as well as per IP. It's also accurate across Cloudflare locations, which an in-memory limiter isn't.

### Security headers and CSP

Static assets get their headers from `public/_headers`. HTML is where the CSP matters.

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- **No `'unsafe-inline'` anywhere.** That's possible because Vite emits no inline runtime script, Tailwind is a static stylesheet, and fonts are self-hosted, so Google Fonts goes away.
- React's `style={...}` and Radix positioning set styles through the CSSOM, which `style-src` doesn't block.
- Start with `Content-Security-Policy-Report-Only` in the first deploy, run the e2e suite, then enforce.
- `img-src https:` is needed because listing images are arbitrary https URLs. Listing `<img>` elements also get `referrerPolicy="no-referrer"`, so image hosts can't see which listing page a user is viewing.
- Trusted Types (`require-trusted-types-for 'script'`) can be added later once checked against Turnstile.

API responses use Hono `secureHeaders()`. Its defaults are HSTS, nosniff, `Referrer-Policy: no-referrer`, COOP and CORP same-origin, and `X-Frame-Options: SAMEORIGIN`, plus `contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] }`. Authenticated responses also get `Cache-Control: no-store`.

### Images

The recommendation is to **keep pasted image URLs**, tightened as follows:

- `https:` only. Today `http:` is allowed, which causes mixed content and gets upgraded anyway.
- At most 2,048 characters, and must parse with `new URL()`.
- No credentials in the URL (`url.username` and `url.password` are rejected).
- Rendered with `loading="lazy"`, `referrerPolicy="no-referrer"`, a fixed aspect-ratio box, and a fallback when loading fails. That fallback behavior already exists in the frontend worktree.
- **The Worker never fetches these URLs**, so there's no SSRF surface. Keep it that way. Any future "fetch and cache the image" feature would need an SSRF allowlist.

| Option | Card? | Pros | Cons |
|---|---|---|---|
| **Pasted https URLs (chosen)** | No | Zero storage, zero code, no abuse surface | Links rot; viewers' browsers contact third-party hosts (privacy); users need somewhere else to host photos |
| KV uploads (optional Phase B6/F5) | No | First-party, 1 GB free, served from our origin | 1,000 writes/day cap; no resizing; we must strip EXIF (GPS) ourselves (canvas re-encode to WebP/JPEG in the browser), sniff magic bytes server-side, block SVG, and serve with `nosniff` + `Content-Disposition: inline` + `CSP: default-src 'none'` |
| D1 BLOBs | No | Transactional with the posting | 2 MB row cap; eats the 500 MB DB and rows-read budget; no CDN caching unless we add the Cache API ourselves |
| R2 | **Subscription checkout (card)** | The right tool for this | Breaks the no-card goal |
| Cloudflare Images | Storage is **Paid only** | Resizing | Not free |
| Third-party free tier (Cloudinary, etc.) | Usually no | Transforms | Another account, secret, and ToS; vendor risk. The STEMtell repo already leaked a Cloudinary key |

### Maps

Drop the map.

- It shows a hard-coded Minneapolis center with no markers, and postings have no location field.
- It needs a Google Maps key tied to a billing account, and the app currently degrades to "Map unavailable" without one.
- Removing it also removes two dependencies (`react-google-maps`, which is abandoned, and `@react-google-maps/api`) and a CSP exception.

If location ever becomes a feature (for example, an "area" field), use **MapLibre GL + OpenFreeMap**: no key, attribution required. The CSP would add `connect-src https://tiles.openfreemap.org` and `worker-src blob:`.

### OWASP alignment (ASVS 4.0.3 L1 / Top 10 2021)

| Area | Plan item |
|---|---|
| A01 Broken Access Control / ASVS V4 | Owner check in SQL (`AND user_id = ?`), 404 for other people's resources, default-deny session middleware on `/api/postings` and `/api/me/*`, tests with two users for every mutating route |
| A02 Cryptographic Failures / V2.4, V6 | PBKDF2 at the platform maximum + pepper; session secrets stored only as SHA-256; HSTS; `__Host-` Secure cookies; secrets only in Worker secrets / GitHub secrets |
| A03 Injection / V5 | zod at every boundary; prepared statements only; React escaping (no `dangerouslySetInnerHTML`, enforced by Biome `noDangerouslySetInnerHtml`); strict CSP |
| A04 Insecure Design | Throttling and Turnstile *before* D1 writes (protects the daily quota); keyset pagination with a capped limit |
| A05 Security Misconfiguration / V14 | `_headers` + `secureHeaders`; no CORS; JSON-only; 415 for anything else; generic 500 bodies; `observability` without bodies |
| A06 Vulnerable Components / V14.2 | Dependabot (npm + actions, grouped weekly), `npm audit --audit-level=high` in CI, actions pinned by SHA, small dependency tree (Redux, saga, axios, MUI, Google Maps, sweetalert, passport, express, and pg all removed) |
| A07 Identification and Authentication Failures / V2, V3 | 8–128 character passwords, breached-password check (V2.1.7), no composition rules, throttling (V2.2.1), session rotation on login (V3.2.1), logout and revoke (V3.3.1), idle and absolute timeouts, passkeys later (V2.8 / phishing resistance) |
| A08 Software and Data Integrity Failures | Lockfile + `npm ci`; deploy only from `main` through a protected GitHub environment; D1 migrations reviewed as SQL |
| A09 Security Logging and Monitoring Failures / V7 | Log auth failures and lockouts (username hash + IP, never the password), 5xx errors with `cf-ray`; Workers Observability; `wrangler tail` |
| A10 SSRF | The server never fetches user URLs (documented invariant); the only outbound calls are to fixed hosts (Turnstile, HIBP) |

---

## 5. Phased migration

Ground rules:

1. Before Phase 0, merge the in-flight `feature/frontend-design` and `feature/backend-routes` branches into `feature/security-hardening` and then `main`. Their a11y work, error states, route semantics, and route tests become **the spec** for the rewrite.
2. All new work happens on `modernize/cloudflare`, branched from that `main`, with one PR per phase.
3. Phase 0 is a single agent working alone. After it, the **frontend (F)** and **backend (B)** tracks run in parallel. They meet in `src/shared/` (schemas, owned by Phase 0, and changes need both tracks to sign off) and in `src/worker/index.ts`'s `AppType`. The frontend works against **MSW mocks** generated from the shared schemas, so it never waits on the backend.
4. The **QA track (Q)** writes tests for each phase, either alongside it or right after it. Each phase's PR must include its Q items before merge.

### Phase 0: Foundation (one agent, sequential)

- Scaffold a single Vite 8 + React 19 + TS project with `@cloudflare/vite-plugin` and Hono, in the layout from §3. Delete nothing from the old app yet. It moves to `legacy/` or simply stays until cutover.
- Tooling:
  - `biome.json` (recommended rules + `noDangerouslySetInnerHtml`, `noExplicitAny`, a11y rules).
  - `tsconfig.*` with strict and `noUncheckedIndexedAccess`.
  - `.nvmrc`, `engines`, `.editorconfig`.
  - Remove `.prettierrc`.
- `wrangler.jsonc` with assets, D1, ratelimits, triggers, and observability; `wrangler types` generates `Env`.
- `migrations/0001_init.sql` (schema from §3) and `0002_seed_switches.sql` (reconstruct catalog data, or start empty).
- `src/shared/`: zod schemas and limits ported from `postings.router.js` and `utils/validation.js`, plus `money.ts`.
- `src/worker/index.ts`: Hono app with `/api/health` only; export `AppType`.
- `src/client/`: "hello" page that calls `/api/health` through `hc`.
- Vitest projects (worker via `@cloudflare/vitest-plugin`, client via jsdom), and a Playwright config with one smoke spec.
- `.github/workflows/ci.yml` and `dependabot.yml` (see §6), with deploy gated on `main` and the `production` environment.
- Kash runs `wrangler login`, `wrangler d1 create keebhub-db`, and the first deploy to `*.workers.dev`.
- **Exit:** `npm run dev` serves the SPA and API on one port; CI is green; `https://keebhub.<acct>.workers.dev/api/health` returns ok.
- **Q0:** schema unit tests (valid and invalid usernames, passwords, postings, including all of today's bad-posting cases: blank title, `javascript:` image, -1, '', 1e20); migration test (apply all migrations to a fresh local D1, FK enforcement on); smoke e2e (home renders, `/api/health` 200, a deep link like `/market` returns index.html, an unknown `/api/x` returns a JSON 404).

### Backend track

**B1: Core API plumbing + public reads**

- Middleware: `secureHeaders` (API CSP), `bodyLimit(100kb)`, JSON-only (415), origin check, `onError`/`notFound` mapping to the error shape, `no-store` on authenticated responses.
- `db/` module conventions.
- `GET /api/switches` with the cache header.
- **Q-B1:**
  - Headers present on API responses.
  - 415 for form-encoded and text/plain bodies.
  - 403 for a cross-origin `Origin` on POST.
  - Malformed JSON returns 400.
  - Oversized body returns 413.
  - Unknown route returns a JSON 404.
  - `/api/switches` shape and `Cache-Control`.
  - Anonymous responses set no cookie.

**B2: Authentication**

- `users`/`sessions` data access, `auth/password.ts` (PBKDF2 + pepper + PHC string + dummy hash), `auth/session.ts`, session middleware, and `register`/`login`/`logout`/`me`.
- Turnstile verification, HIBP check, D1 throttle, and the Rate Limiting binding (feature-detected: if `env.AUTH_LIMITER` is undefined, skip it).
- `scheduled()` purge.
- **Exit:** login p95 `cpuTime` is measured in production and recorded in the PR.
- **Q-B2:**
  - Register validation, plus 409 for a duplicate. Duplicates are case-insensitive (`Alice` vs `alice`).
  - Wrong password and unknown user both return 401 with indistinguishable bodies.
  - Non-string credentials return 400.
  - The cookie has `__Host-`, HttpOnly, Secure, SameSite=Lax, and Path=/.
  - The session id rotates on login.
  - After logout, the token is rejected.
  - Expired sessions are rejected; sliding refresh happens only past the half-life.
  - The absolute cap is enforced.
  - The password hash never appears in any response.
  - Throttle: the 11th failure returns 429 with `Retry-After`; success resets the counter.
  - Register throttle per IP.
  - Turnstile failure returns 400/403 **with no D1 write** (assert the row count).
  - HIBP hit is rejected; HIBP down fails open (mock `fetch`).
  - The PHC parse/format round-trips.
  - Pepper version mismatch triggers a rehash on login.

**B3: Postings + saved listings**

- Postings CRUD with owner-scoped SQL and keyset pagination (`limit` 1–100, opaque cursor), `GET /api/postings/:id`, `/api/me/postings`, and saved PUT/DELETE/GET.
- **Q-B3:** port every test in `server/test/routes.test.js`, adapted to the new paths:
  - Auth required.
  - Validation, including id parsing (`abc`, `0`, `99999999999`).
  - Owner-only PUT/DELETE return 404 for others.
  - Pagination ordering and `nextCursor`.
  - `limit` clamping.
  - Saved listings scoped per user and idempotent; 404 for a missing posting.
  - Cascade: deleting a posting removes saved rows.
  - Price-cents round-trip (`199.99` becomes `19999` and comes back unchanged).

**B4: Account management + ops**

- `POST /api/auth/password` (verify the current password, rehash, revoke other sessions).
- `DELETE /api/me` (confirm with the password).
- Structured auth-event logging; README "operations" notes (tail, Time Travel restore).
- **Q-B4:**
  - Change password: other sessions die, the current one survives, the old password fails.
  - Delete account cascades postings, saved rows, and sessions.
  - Logs never contain passwords or tokens (spy on `console`).
  - Cron purge removes only expired rows.

**B5 (optional, recommended): Passkeys**

- `passkeys` table (credential id, public key, counter, transports, user_id).
- `@simplewebauthn/server` registration and authentication with `userVerification: "required"`.
- Challenges stored in a short-lived D1 row bound to a pre-session cookie.
- "Add a passkey" for signed-in users; passkey sign-in; optionally passwordless accounts with recovery codes (high-entropy, so a single SHA-256 is enough).
- Reuse the KeyPass designs.
- **Q-B5:**
  - Use SimpleWebAuthn's test vectors.
  - A challenge can't be reused.
  - An expired challenge is rejected.
  - Wrong RP ID / origin is rejected.
  - Counter regression is handled.
  - Deleting a passkey requires a fresh login.

**B6 (optional): KV image uploads**

- `POST /api/images`: authenticated, at most 1 MB, magic bytes must be JPEG, PNG, or WebP, key = random UUID.
- `GET /img/:key`: served with nosniff, `CSP default-src 'none'`, and an immutable cache.
- Daily per-user cap.
- **Q-B6:** an SVG or HTML disguised as `.png` is rejected; size cap; auth required; served headers.

### Frontend track

**F1: App shell + design system**

- Tailwind v4 `@theme` tokens, ported from `theme.js` and `App.css`: purple palette, 4.5:1 contrast verified.
- `shadcn init` and only the components we use (button, card, input, textarea, label, form, alert-dialog, sonner, skeleton).
- Self-hosted Squada One via `@fontsource/squada-one`.
- Layout, Nav, Footer, skip link, and route-change focus management, ported from the frontend worktree's `App.jsx`.
- React Router v8 `createBrowserRouter`, TanStack Query provider with defaults (`retry` 1, no retry on 401/403/404), error boundary, 404 page, `useDocumentTitle`.
- `public/_headers` with CSP in **Report-Only**.
- MSW dev mocks.
- **Q-F1:**
  - Component tests for Nav, SkipLink, StatusMessage.
  - Playwright + axe on the home, about, and 404 pages with zero serious or critical violations.
  - Keyboard-only navigation across nav links.
  - Route change moves focus to `<main>`.
  - No CSP report violations in the console.

**F2: Auth UI**

- Login and register pages (react-hook-form + shared zod, inline field errors, `aria-describedby`, `autocomplete="username"` / `current-password` / `new-password`).
- Turnstile widget component.
- `meQuery`; a protected-route loader that redirects to `/login?next=` (validate `next` as a same-origin relative path to avoid an open redirect).
- Logout button; on 401, any query clears `me` and redirects.
- Profile page.
- **Q-F2:**
  - Form validation messages match the shared limits.
  - Server 409 and 429 messages are shown.
  - `next` param open-redirect test (`//evil.com` and `https://evil.com` are rejected).
  - The password never appears in the DOM or console after submit.

**F3: Market**

- Postings list (`useInfiniteQuery` + "Load more"), ListingCard (image fallback, `referrerPolicy`), create and edit pages sharing ListingForm (dollars input converted to cents through `money.ts`), delete with AlertDialog, Sonner toasts (replacing sweetalert), and My Listings with edit and delete actions.
- **Q-F3:**
  - Optimistic or invalidation behavior after create, edit, and delete.
  - Edit and delete controls render only for the owner.
  - Price formatting.
  - A broken image shows the placeholder.

**F4: Saved listings, switch guide, static pages**

- Save and unsave toggle on cards (`aria-pressed`), a Saved page (replacing the stub), the switch guide (port SwitchList), the landing and about pages.
- **Remove the map.**
- **Q-F4:** save toggles are idempotent in the UI; switch guide empty, error, and retry states; axe on all pages.

**F5 (optional): Passkey and upload UI**

- `@simplewebauthn/browser` "Sign in with a passkey" and "Add passkey" on the profile page.
- Image picker that re-encodes through a canvas (strips EXIF) and shows upload progress.
- **Q-F5:** Playwright virtual authenticator (CDP `WebAuthn.addVirtualAuthenticator`) covering register and login with a passkey.

### Cutover (one agent, after B1–B4 and F1–F4)

- Turn off MSW in production builds (assert no `mockServiceWorker.js` in `dist/`).
- Switch the CSP from Report-Only to enforced.
- Run the full e2e suite against `vite preview` (workerd + local D1) and against the deployed `workers.dev` URL (read-only smoke tests).
- Delete `server/`, the CRA files, Redux, `database.sql`, the Postman files, and the Heroku settings.
- Rewrite the README (dev, test, deploy, D1 migrations, Time Travel restore, rotating the pepper or Turnstile keys).
- Merge to `main`, which triggers the deploy.
- **Q-C:** full Playwright journey:
  - Register, log out, log in.
  - Create, edit, and delete a listing.
  - User B can't edit A's listing (two browser contexts; API-level PUT returns 404).
  - Save and unsave.
  - Logout makes protected pages redirect.
  - Deep-link reload on `/mylistings` works.
  - Security header assertions on `/` and `/api/auth/me`.
  - Lighthouse a11y score ≥ 95 (optional).

### Parallelism map

```
P0 ──┬── B1 ── B2 ── B3 ── B4 ──(B5)──(B6)──┐
     └── F1 ── F2 ── F3 ── F4 ──(F5)────────┴── Cutover
         (MSW mocks from src/shared)        Q runs inside every phase
```

B2 and F2 should finish near each other, because F2's real-API e2e needs B2. Until then F2 tests against MSW.

---

## 6. Tooling, CI, IaC

### `ci.yml` (shape)

```yaml
on: { pull_request: {}, push: { branches: [main] } }
permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>            # pin all actions by SHA; Dependabot bumps them
      - uses: actions/setup-node@<sha>
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx biome ci .
      - run: npm run typecheck                  # tsc -b
      - run: npm test                           # vitest: worker (workerd + local D1) + client
      - run: npm audit --audit-level=high
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e                        # build + vite preview + local D1 migrations
  deploy:
    needs: check
    if: github.ref == 'refs/heads/main'
    environment: production                     # require Kash's approval
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci && npm run build
      - uses: cloudflare/wrangler-action@<sha>
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: d1 migrations apply keebhub-db --remote
      - uses: cloudflare/wrangler-action@<sha>
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

- **API token scope:** an account-scoped custom token with *Workers Scripts: Edit* and *D1: Edit*, limited to Kash's account only. Add *Workers Routes: Edit* or *Zone DNS* only if a custom domain is added. Set an expiry and rotate it yearly.
- **Migrations:** they run before deploy, so they must be **backward compatible with the running version** (expand, then contract). The PR template should say so.
- **Dependabot:**
  - `npm` weekly, with groups: `react`, `cloudflare` (wrangler, workers-types, vite-plugin, vitest-plugin), `dev-tooling`.
  - `github-actions` weekly.
  - Keep the security updates already enabled.
- Renovate isn't needed at this size.

### Terraform

Not worth it for v1.

- `wrangler.jsonc` already declares the Worker, assets, D1 binding, crons, and rate limits.
- Terraform-managed Workers or D1 would conflict with `wrangler deploy`.
- Free remote state is awkward: R2 would need the card, and HCP has its own terms.

There's a reasonable portfolio stretch for later, with local or encrypted-in-repo state: use the Cloudflare provider v5 for **account-level** things only, such as the Turnstile widget, the scoped API token, a custom domain or zone, and a WAF rate-limit rule. That matches Kash's day job without touching app deploys.

---

## 7. Risks and open questions

| Risk / question | Mitigation / who decides |
|---|---|
| **Login CPU over 10 ms on real hardware** (PBKDF2 50k ≈ 3.5 ms on an M5; a password change derives twice) | Iterations already lowered to 50k before launch. Measure after the first deploy; the fallback is passkey-first (B5). **Kash decides:** are passkeys the primary sign-in, with passwords as fallback? KeyPass synergy argues yes |
| PBKDF2 at 50k is below OWASP's 600k | Pepper kept outside D1; breached-password check; throttling; passkeys. Documented as an accepted risk |
| Free-tier daily quotas (100k requests, 100k D1 writes) can be exhausted by an attacker, taking the site down until 00:00 UTC | Turnstile + throttle before writes. A custom domain on a Cloudflare zone would unlock the free WAF rate-limit rule (1 rule, 10 s period). Acceptable for a hobby app |
| Rate Limiting binding may not deploy on Free (undocumented) | The code feature-detects it; D1 throttle is authoritative |
| `STRICT` tables on D1 unverified | Check in Phase 0; if rejected, drop `STRICT` and rely on CHECKs |
| Toolchain churn (TS 7 brand-new, Vitest 5 plus plugin rename, Drizzle avoided) | Pin exact versions via the lockfile; Dependabot groups; fall back to TS 6.0.3 if any tool breaks |
| Market requires login today | **Kash decides:** keep it (current behavior), or make browsing public and gate only create, save, and edit |
| Session length: today 1 h, proposed 7 days sliding / 30 days absolute | **Kash decides** |
| Switch catalog data: the original seed was never committed | **Kash decides:** reconstruct a small seed (agent can draft it), or ship empty |
| Two worktree branches are mid-flight on the old stack | Merge them first. They become the spec, and their tests get ported in Q-B3 |
| No email means no password reset | Accepted for v1. Passkeys and recovery codes (B5) are the real fix. An admin can delete an account via `wrangler d1 execute` |

### Data migration (Postgres to D1)

There is almost certainly **nothing to migrate**:

- Heroku ended free dynos and free Postgres on 2022-11-28.
- The `postings`, `switches`, and `saved_listings` DDL was never committed, which suggests the database was a bootcamp dev database.

How Kash can check:

```bash
heroku apps --all                      # any keebhub app?
heroku addons -a <app>                 # heroku-postgresql still attached?
heroku pg:info -a <app>                # row counts / plan
```

If a database exists:

1. `pg_dump --data-only --column-inserts --table=switches --table=postings`. The `switches` catalog is the valuable part.
2. Transform it with a one-off script: SERIAL ids are kept; `price` becomes `round(price*100)` as `price_cents`; `timestamptz` becomes unixepoch; `http:` image URLs are rewritten to `https:` or dropped.
3. Load it into `0003_import.sql` and apply locally, then remotely.

**Users and bcrypt hashes don't migrate.** Verifying bcrypt cost 10 on Workers Free would blow the CPU budget, since bcryptjs is pure JS. Layering (`pbkdf2(bcrypt_hash)`) doesn't help, because login would still have to compute bcrypt. So:

- Do **not** import `user` rows. Old users re-register.
- Imported postings either get reassigned to an "archived" system user (read-only) or are dropped. Kash decides if it ever comes up.
- Delete the Heroku app and add-on afterwards so a forgotten database isn't left online.

---

## 8. Things Kash must do herself

1. **Merge or close the in-flight branches** (`feature/frontend-design`, `feature/backend-routes`, `feature/security-hardening`) so Phase 0 starts from one `main`.
2. **Grant the GitHub CLI the `workflow` scope** (`gh auth refresh -s workflow`). Without it, the new `ci.yml` can't be pushed; this already blocked an earlier pipeline change.
3. **Create a Cloudflare account** on the Free plan and **don't add a payment method**. Don't click "Purchase R2" or "Images Paid".
4. On her machine:
   - `npx wrangler login`.
   - `npx wrangler d1 create keebhub-db` (paste the id into `wrangler.jsonc`).
   - `npx wrangler secret put PASSWORD_PEPPER_V1`, using `openssl rand -base64 32`. **Keep an offline copy**, because losing the pepper means every user has to reset.
   - `npx wrangler secret put TURNSTILE_SECRET_KEY`.
5. **Create a Turnstile widget** in the dashboard for the `workers.dev` hostname, plus `localhost` for dev. The public site key goes in `vars`.
6. **Create a scoped API token** (Workers Scripts: Edit + D1: Edit, this account only, with an expiry). Add the GitHub repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and create the `production` environment with herself as required reviewer.
7. **Check Heroku** for any surviving app or database (§7) and delete it.
8. **Decide on the open questions:**
   - Passkeys primary or optional.
   - Whether the market is public.
   - Session length.
   - Switch seed data.
   - Custom domain or not.
9. After the first deploy, **check the dashboard** (Billing shows the Free plan and no payment method) and look at the login `cpuTime` in Observability.

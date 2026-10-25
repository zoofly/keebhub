# keebhub test traceability matrix

QA track, 2026-10-24, branch `modernize/qa` (from `modernize/cloudflare` at 5af28ff). It maps every requirement in [`docs/modernization-plan.md`](../modernization-plan.md) (the Q items in §5, the security design in §4, and the decisions block at the top), every endpoint and status code in [`docs/api.md`](../api.md), and the 18 legacy flows in [`docs/legacy-acceptance/e2e-legacy.js`](../legacy-acceptance/e2e-legacy.js) to the tests that check it.

**Status:** **C** = covered (a test fails if the requirement breaks), **P** = partial (some cases, a weak assertion, or only indirect), **M** = missing, **D** = needs a real deploy (see the [post-deploy checklist](#post-deploy-checklist)). "Before" is `5af28ff`; "After" is this branch.

## Summary

| Section | Rows | Before C / P / M / D | After C / P / M / D |
|---|---:|---|---|
| [Q items](#1-q-items-plan-5) | 52 | 44 / 6 / 1 / 1 | 50 / 0 / 1 / 1 |
| [§4 security design](#2-security-design-plan-4) | 46 | 30 / 11 / 4 / 1 | 44 / 1 / 0 / 1 |
| [Decisions and amendments](#3-decisions-and-amendments) | 13 | 10 / 2 / 0 / 1 | 12 / 0 / 0 / 1 |
| [API endpoints and status codes](#4-api-endpoints-and-status-codes-docsapimd) | 61 | 47 / 6 / 8 / 0 | 61 / 0 / 0 / 0 |
| [Legacy flows](#5-legacy-acceptance-flows) | 18 | 18 / 0 / 0 / 0 | 18 / 0 / 0 / 0 |
| **Total** | **190** | **149 / 25 / 13 / 3** | **185 / 1 / 1 / 3** |

The one remaining partial is constant-time comparison (S5: verified by code reading, not measurable in a test). The one remaining missing item is the optional Lighthouse score (Q-C.8). The three D rows can only be checked against a deployed Worker.

Test totals: Vitest **315 → 598** (worker 209 → 477, client 106 → 121); Playwright **108 passed / 6 skipped → 120 passed / 6 skipped** (new `e2e/qa-security.spec.ts`, 6 tests × 2 widths).

### Test file key

| Key | File |
|---|---|
| b1, b2, b3, b4 | `src/worker/test/b1-plumbing.test.ts`, `b2-auth`, `b3-postings`, `b4-account` |
| mig, pw, thr, health | `src/worker/test/migrations.test.ts`, `password.test.ts`, `throttle.test.ts`, `health.test.ts` |
| **q-authz** | `src/worker/test/qa-authz.test.ts` (new) |
| **q-sess** | `src/worker/test/qa-sessions.test.ts` (new) |
| **q-input** | `src/worker/test/qa-input.test.ts` (new) |
| **q-abuse** | `src/worker/test/qa-abuse.test.ts` (new) |
| **q-page** | `src/worker/test/qa-paging-integrity.test.ts` (new) |
| **q-plumb** | `src/worker/test/qa-plumbing.test.ts` (new) |
| schemas, money, **q-fuzz** | `src/shared/schemas.test.ts`, `money.test.ts`, `qa-fuzz.test.ts` (new) |
| Nav, Skip, Status, Auth, Profile, ListForm, Market, Switch, api, safeNext, fmt, contrast, contract | client tests under `src/client/` |
| **q-client** | `src/client/qa-client.test.tsx` (new) |
| e2e:*name* | `e2e/<name>.spec.ts`; **e2e:qa-sec** is `e2e/qa-security.spec.ts` (new) |
| legacy *n* | `e2e/legacy-flows.spec.ts`, flow *n* (runs at 1280 and 375 px) |

---

## 1. Q items (plan §5)

| ID | Requirement | Tests | Before | After |
|---|---|---|---|---|
| Q0.1 | Schema unit tests: valid/invalid usernames, passwords, postings, incl. blank title, `javascript:` image, -1, '', 1e20 | schemas, money; q-fuzz, q-input | C | C |
| Q0.2 | Migrations apply to a fresh local D1; FKs enforced | mig "enforce foreign keys", "create every table as STRICT"; manual `wrangler d1` check (§6) | C | C |
| Q0.3 | Smoke e2e: home renders, `/api/health` 200, deep link `/market` gets index.html, unknown `/api/x` JSON 404 | e2e:smoke (4 tests) | C | C |
| Q-B1.1 | Security headers on API responses | b1 "are set on API responses", "also apply to error responses"; e2e:security-headers; q-plumb (every error status) | C | C |
| Q-B1.2 | 415 for form-encoded and text/plain | b1 JSON-only; q-input (9 content types, none written) | C | C |
| Q-B1.3 | 403 for cross-origin Origin on POST | b1 origin check; e2e:security-headers "cross-origin writes"; q-sess (CSRF logout) | C | C |
| Q-B1.4 | Malformed JSON → 400 | b1 (one case) → q-input (7 malformed, 5 non-object, 40k-deep nesting) | P | C |
| Q-B1.5 | Oversized body → 413 | b1 (one case) → q-input (exact 100 KB boundary, +1 byte, chunked stream, refused before any handler) | P | C |
| Q-B1.6 | Unknown route → JSON 404 | b1, health, e2e:smoke | C | C |
| Q-B1.7 | `/api/switches` shape and Cache-Control | b1; q-plumb (ordered by name) | C | C |
| Q-B1.8 | Anonymous responses set no cookie | b1 "set no cookie" | C | C |
| Q-B2.1 | Register validation + 409 duplicate, case-insensitive | b2; q-input (19 bad usernames, 4 case/space variants → 409) | C | C |
| Q-B2.2 | Wrong password and unknown user: 401, indistinguishable | b2 "same 401 body"; q-abuse (same body, headers and PBKDF2 work) | C | C |
| Q-B2.3 | Non-string credentials → 400 | b2; q-input (number/null/array/object) | C | C |
| Q-B2.4 | Cookie `__Host-`, HttpOnly, Secure, SameSite=Lax, Path=/ | b2 (login only) → q-sess (register, login, refresh, logout; no Domain) + e2e:qa-sec (browser cookie jar) | P | C |
| Q-B2.5 | Session id rotates on login | b2; q-sess (login with old cookie, switching users, register while signed in) | C | C |
| Q-B2.6 | Token rejected after logout | b2; q-authz (all 11 protected routes) | C | C |
| Q-B2.7 | Expired sessions rejected; sliding refresh only past the half-life | b2; q-sess (±60 s around the half-life, the exact expiry second, refresh on public reads) | C | C |
| Q-B2.8 | Absolute cap enforced | b2; q-sess (31 days of daily use, refreshed Max-Age capped); q-authz | C | C |
| Q-B2.9 | Password hash never in any response | b2; q-authz (public list/detail) | C | C |
| Q-B2.10 | 11th failure → 429 + Retry-After; success resets | b2; q-abuse (correct password also 429 while locked, no writes, unlock after expiry) | C | C |
| Q-B2.11 | Register throttle per IP | b2 | C | C |
| Q-B2.12 | Turnstile failure → 403 with no D1 write (row count) | b2 (counts of 3 tables) → q-abuse (full table snapshots; 5 siteverify failure modes; missing secret; bad tokens) | C | C |
| Q-B2.13 | HIBP hit rejected; HIBP down fails open (mock fetch) | b2 (throw only) → q-abuse (503, 429, garbage body, network error; padding rows; not called needlessly) | P | C |
| Q-B2.14 | PHC parse/format round-trips | pw | C | C |
| Q-B2.15 | Pepper version mismatch → rehash on login | b2 "re-hashes…", pw | C | C |
| Q-B3.1 | Auth required | b3 → q-authz (every route × 8 dead-session kinds) | C | C |
| Q-B3.2 | Validation incl. ids `abc`, `0`, `99999999999` | b3, schemas; q-input (14 ids on all 5 id routes) | C | C |
| Q-B3.3 | Owner-only PUT/DELETE → 404 for others | b3; q-authz (body identical to a missing posting's, no DB change); e2e:journey | C | C |
| Q-B3.4 | Pagination order and `nextCursor` | b3; q-page (every page size walks the same items once; churn between pages) | C | C |
| Q-B3.5 | `limit` clamping | b3 (status only) → q-page (item counts for 0, 1, 01, 100, 101, 999999999; 9 bad limits) | P | C |
| Q-B3.6 | Saved listings per user, idempotent; 404 for a missing posting | b3; q-authz | C | C |
| Q-B3.7 | Deleting a posting removes saved rows | b3; q-page | C | C |
| Q-B3.8 | Price-cents round-trip (199.99 → 19999) | b3; q-input (boundaries + 25 random through POST/GET/PUT/D1, stored as INTEGER); q-fuzz | C | C |
| Q-B4.1 | Change password: others die, current survives, old fails | b4; q-sess; q-authz | C | C |
| Q-B4.2 | Delete account cascades postings, saved rows, sessions | b4; q-page (no orphans, `foreign_key_check`); q-authz (every device) | C | C |
| Q-B4.3 | Logs never contain passwords or tokens | b4 | C | C |
| Q-B4.4 | Cron purge removes only expired rows | b4 | C | C |
| Q-F1.1 | Component tests: Nav, SkipLink, StatusMessage | Nav, Skip, Status | C | C |
| Q-F1.2 | axe on home, about, 404: no serious/critical | e2e:shell, e2e:a11y | C | C |
| Q-F1.3 | Keyboard-only navigation across nav links | e2e:shell | C | C |
| Q-F1.4 | Route change moves focus to `<main>` | Skip, e2e:shell | C | C |
| Q-F1.5 | No CSP violations in the console | every e2e test (fixture fails on any CSP report); e2e:security-headers | C | C |
| Q-F2.1 | Form messages match the shared limits | Auth, e2e:auth, legacy 4 | C | C |
| Q-F2.2 | Server 409 and 429 messages shown | Auth, e2e:auth, legacy 5 and 18 | C | C |
| Q-F2.3 | `?next=` open redirect: `//evil.com`, `https://evil.com` rejected | safeNext, e2e:auth (3 values). **Bypassed by `/.//evil.com` (bug 3, fixed)** → safeNext (dot-segment cases, ~22,000-path exhaustive check), e2e:qa-sec (3 bypasses, guest and signed-in) | P | C |
| Q-F2.4 | Password never in the DOM or console after submit | Auth, e2e:auth | C | C |
| Q-F3 | Invalidation after create/edit/delete; owner-only controls; price formatting; broken-image placeholder | ListForm, Market, fmt, e2e:market, e2e:journey, legacy 7 | C | C |
| Q-F4 | Save toggle idempotent; switch guide empty/error/retry; axe on all pages | Market, Switch, e2e:saved, e2e:a11y | C | C |
| Q-C.1–7 | Journey: register/logout/login; create/edit/delete; B can't edit A's (UI + API 404); save/unsave; logout redirects; `/mylistings` reload; headers on `/` and `/api/auth/me` | e2e:journey, e2e:security-headers, e2e:auth | C | C |
| Q-C.8 | Lighthouse a11y ≥ 95 (optional) | none (axe covers the same rules) | M | M |
| Q-C.9 | Cutover: no `mockServiceWorker.js` in `dist/`; e2e against the deployed URL | e2e:build-hygiene; deployed smoke: none yet | D | D |

## 2. Security design (plan §4)

| ID | Requirement | Tests | Before | After |
|---|---|---|---|---|
| S1 | PBKDF2-HMAC-SHA256, 50,000 iterations (half the workerd cap of 100,000; Kash's pre-launch decision so a password change fits 10 ms of CPU) | pw "uses at most workerd's PBKDF2 limit", "uses 50,000 iterations"; q-abuse (PBKDF2_ITERATIONS seen on login) | C | C |
| S2 | 16-byte salt, 32-byte output | pw (parse rejects other sizes) | C | C |
| S3 | Pepper: HMAC-SHA256(pepper, NFC(password)); pepper only a secret | pw "depends on the pepper", "NFC-normalizes"; q-input (NFC/NFD login) | C | C |
| S4 | PHC string with algorithm, cost, pepper version | pw | C | C |
| S5 | Constant-time compare (`timingSafeEqual`) | code reading only (`lib/crypto.ts` bytesEqual) | P | P |
| S6 | Dummy derivation for unknown usernames | pw (result only) → q-abuse (same PBKDF2 calls and iterations, same response) | P | C |
| S7 | Password policy: 8–128 code points, NFC, no composition rules | schemas; q-input (128 vs 129 emoji, 7 vs 8); q-fuzz | C | C |
| S8 | HIBP k-anonymity (5 hex chars), fail open | b2; q-abuse | C | C |
| S9 | Login CPU budget (~10 ms on Free) | local bench (§6); production `cpuTime` | D | D |
| S10 | Token `<id>.<secret>`, 120 bits each, base32; D1 stores only SHA-256(secret) | b2 (forged secret) → q-sess (shape, stored hash equals SHA-256, secret absent from D1, uniqueness) | P | C |
| S11 | Cookie `__Host-keebhub_session`; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age | b2 → q-sess, e2e:qa-sec | P | C |
| S12 | `__Host-`/Secure works on `http://localhost` (dev) | used implicitly → e2e:qa-sec (browser stores it host-only, Secure, HttpOnly, Lax, 7 days; not readable by JS; removed on logout) | P | C |
| S13 | Sliding 7 days; extended only under half the window | b2, q-sess | C | C |
| S14 | Absolute 30 days from `created_at` | b2, q-sess | C | C |
| S15 | New session on every login **and register** (no fixation) | b2 (login) → q-sess (register while signed in, login as another user) | P | C |
| S16 | Logout deletes the row | b2; q-sess (only this device) | C | C |
| S17 | Password change deletes all other sessions | b4; q-sess | C | C |
| S18 | Account deletion cascades sessions | b4; q-authz | C | C |
| S19 | Daily cron purges expired rows | b4 | C | C |
| S20 | Middleware exposes only `{id, username}`; the hash never leaves `db/users.ts` | b2 "never returns the password hash"; q-authz | C | C |
| S21 | CSRF 1: SameSite=Lax | b2, q-sess, e2e:qa-sec | C | C |
| S22 | CSRF 2: JSON-only, 415 otherwise | b1, q-input | C | C |
| S23 | CSRF 3: Origin / Sec-Fetch-Site check → 403 | b1, q-sess | C | C |
| S24 | CSRF 4: no CORS at all | none → q-input (no `Access-Control-*` on a preflight or a cross-origin GET) | M | C |
| S25 | Turnstile verified before any D1 write | b2 → q-abuse (full snapshots across 6 refused requests) | C | C |
| S26 | Rate-limit binding: ~10/60 s per IP on `/api/auth/*`, 429 + Retry-After | none → q-abuse (login, register; Retry-After 60; other IPs unaffected; reads not limited) | M | C |
| S27 | D1 throttle, login: 10/15 min per username + IP (15 min lock; success clears it), backstop 100/hour per username, 30/15 min per IP; IPv6 keyed by /64. Password change and delete: 5/15 min per session, separate from login (pre-launch review) | b2, thr, ip → q-abuse (pair lock leaves other IPs alone, spread failures don't lock the owner, backstop, all spellings share a key, unknown names, per-IP via the endpoint, per-session account-form lock that neither blocks nor is blocked by login) | P | C |
| S28 | D1 throttle, register: 5 per IP per hour | b2 | C | C |
| S29 | Body limit 100 KB | b1, q-input | C | C |
| S30 | `_headers` CSP exactly as §4 | e2e:security-headers (string equality) | C | C |
| S31 | HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP on assets | e2e:security-headers | C | C |
| S32 | `/assets/*` immutable | e2e:security-headers | C | C |
| S33 | No `'unsafe-inline'` / `'unsafe-eval'` | e2e:security-headers (asserted absent; inline script blocked) | C | C |
| S34 | CSP enforced, not Report-Only | e2e:security-headers | C | C |
| S35 | Listing `<img>`: `referrerPolicy="no-referrer"`, lazy | e2e:market; q-client | C | C |
| S36 | API `secureHeaders` + `default-src 'none'; frame-ancestors 'none'` | b1, e2e:security-headers; q-plumb (on every error status) | C | C |
| S37 | Authenticated responses `Cache-Control: no-store` | b1, e2e:security-headers. **Public routes could cache a Set-Cookie (bug 2, fixed)** → b1 regression, q-authz (every 401) | P | C |
| S38 | Images: `https:` only | schemas, b3. **`https:host` forms gave a 500 (bug 1, fixed)** → schemas, b3, q-input, q-fuzz, q-client | P | C |
| S39 | Images: ≤ 2048 chars and parse with `new URL()` | schemas, q-input (2048 accepted, 2049 refused) | C | C |
| S40 | Images: no credentials | schemas, q-input (user+password and user only) | C | C |
| S41 | Images: lazy, no Referer, fixed box, fallback on error | e2e:market, Market, q-client | C | C |
| S42 | The Worker never fetches user URLs (no SSRF) | none → q-plumb (create/edit/list with metadata-IP and localhost URLs: zero outbound fetches) | M | C |
| S43 | A05: generic 500 bodies, no internals | none → q-plumb (D1 failure → `Internal server error`, detail only in the server log) | M | C |
| S44 | A03: prepared statements only | CI grep "No SQL built with template literals" | C | C |
| S45 | A03: no `dangerouslySetInnerHTML`; stored XSS renders inertly | Biome rule; Market, legacy 11 (title/description on the market) → e2e:qa-sec (title, description and image URL on market, detail, my listings, saved, edit form, page title and toast, under the enforced CSP) | P | C |
| S46 | A09: auth failures and lockouts logged with a username hash and IP, never the password | b4 (failures, no secrets in any line) → q-abuse (`auth.locked` event with hash and IP, no name or password) | P | C |

## 3. Decisions and amendments

| ID | Decision | Tests | Before | After |
|---|---|---|---|---|
| A1 | Market list and detail browsable logged out; posting, editing, deleting, saving need login | b3 "market reads are public"; e2e:market, e2e:saved, legacy 2; q-authz | C | C |
| A2 | Sessions 7 days sliding, 30-day absolute cap, server-side, revocable | b2, b4, q-sess, q-authz | C | C |
| A3 | ~20 seeded switches (name, type, manufacturer) | mig, b1, e2e:saved | C | C |
| A4 | workers.dev, no deploys by agents | `wrangler.jsonc` (`workers_dev: true`, placeholder D1 id, CI deploy gate) | D | D |
| A5 | Every error path is JSON `{error}` (incl. 429, 401, 404, 413, 415) | b1, b2 (each code somewhere; 500/503 never) → q-plumb (every status incl. 500/503), q-authz, q-input | P | C |
| A6 | Usernames: case-insensitive uniqueness, allowed characters, trimming, in `src/shared` | schemas, b2, mig → q-input (homoglyph, NFC/NFD, NUL, Kelvin, fullwidth: refused at register, never match at login), q-fuzz | C | C |
| A7 | Prices bounded and strictly decimal (no `0x10`, exponents, > 99,999,999.99); integer cents | money, schemas, b3 → q-fuzz (BigInt reference on 2,000 random strings), q-input | C | C |
| A8 | Cursor paging with a real "Load more", no silent cap | b3, e2e:market → q-page | C | C |
| A9 | `npm ci` without `--legacy-peer-deps`; Node pinned | CI runs `npm ci` on `.nvmrc` (24); `engines.node` 24.x | C | C |
| A10 | CSP enforced; `https:` images only; no mixed content | e2e:security-headers, schemas, q-input | C | C |
| A11 | Clear all client state (TanStack Query cache) on logout | Nav (logout) → q-client (account deletion; next user on the same tab), e2e:qa-sec (Back after logout shows no cached page) | P | C |
| A12 | No source maps in production | e2e:build-hygiene; `wrangler.jsonc` `upload_source_maps: false` | C | C |
| A13 | The 18 legacy flows × 1280 and 375 px are the QA spec | e2e:legacy-flows (section 5) | C | C |

## 4. API endpoints and status codes (`docs/api.md`)

| ID | Endpoint | Status | Tests | Before | After |
|---|---|---|---|---|---|
| E1 | conventions | 403 cross-origin write | b1, q-sess | C | C |
| E2 | conventions | 415 non-JSON body; bodyless writes allowed | b1, q-input | C | C |
| E3 | conventions | 413 over 100 KB | b1, q-input | C | C |
| E4 | conventions | 400 malformed JSON | b1, q-input | P | C |
| E5 | conventions | ids 1..2147483647, else 400 | schemas, b3, q-input | C | C |
| E6 | conventions | paging: default 20, clamp 1..100, non-digits 400, bad cursor 400 | b3 → q-page | P | C |
| E7 | conventions | `no-store` unless listed | b1, e2e:security-headers, q-plumb | C | C |
| E8 | conventions | `fields` keys match request keys | b1, q-input ("reports every bad field at once") | C | C |
| E9 | `GET /api/health` | 200 `{status:"ok"}` | health, e2e:smoke | C | C |
| E10 | `GET /api/health` | 503 `unavailable` | none → q-plumb | M | C |
| E11 | `GET /api/config` | 200, cached 5 min | b1 (body only) → b1 regression, q-plumb | P | C |
| E12 | `GET /api/switches` | 200, by name, cached 5 min | b1 (order not checked) → q-plumb | P | C |
| E13 | `GET /api/postings` | 200 newest first | b3, q-page | C | C |
| E14 | `GET /api/postings` | 400 | b3, q-page | C | C |
| E15 | `GET /api/postings/:id` | 200 | b3 | C | C |
| E16 | `GET /api/postings/:id` | 400 | b3, q-input | C | C |
| E17 | `GET /api/postings/:id` | 404 | b3 | C | C |
| E18 | `POST /api/auth/register` | 201 `{user}` + cookie | b2, q-sess | C | C |
| E19 | `POST /api/auth/register` | 400 `fields.username` / `fields.password` incl. breached | b2, b1, q-input | C | C |
| E20 | `POST /api/auth/register` | 403 bot check | b2, q-abuse | C | C |
| E21 | `POST /api/auth/register` | 409 case-insensitive, `fields.username` | b2, q-input | C | C |
| E22 | `POST /api/auth/register` | 429 | b2, q-abuse | C | C |
| E23 | `POST /api/auth/login` | 200 `{user}` + new cookie | b2, q-sess | C | C |
| E24 | `POST /api/auth/login` | 400 malformed | b2, q-input, q-abuse | C | C |
| E25 | `POST /api/auth/login` | 401, same body either way | b2, q-abuse | C | C |
| E26 | `POST /api/auth/login` | 403 bot check | b2, q-abuse | C | C |
| E27 | `POST /api/auth/login` | 429 | b2, q-abuse | C | C |
| E28 | `POST /api/auth/logout` | 204, clears the cookie, with a session | b2, q-sess | C | C |
| E29 | `POST /api/auth/logout` | 204 "always succeeds" (no session) | none → q-sess | M | C |
| E30 | `GET /api/auth/me` | 200 `{id, username}` | b2 | C | C |
| E31 | `GET /api/auth/me` | 401 | b2, q-authz | C | C |
| E32 | `POST /api/auth/password` | 204, other sessions signed out | b4, q-sess | C | C |
| E33 | `POST /api/auth/password` | 400 `fields.currentPassword` / `fields.newPassword` (incl. breached) | b4 | C | C |
| E34 | `POST /api/auth/password` | 401 | b4, q-authz | C | C |
| E35 | `POST /api/auth/password` | 429 | none → q-abuse | M | C |
| E36 | `GET /api/me/postings` | 200 own, newest first | b3, q-authz | C | C |
| E37 | `GET /api/me/postings` | 400 | none (only market and saved) → q-page | M | C |
| E38 | `GET /api/me/postings` | 401 | b3, q-authz | C | C |
| E39 | `GET /api/me/saved` | 200 most recently saved first | b3, q-page (same-second tie-break) | C | C |
| E40 | `GET /api/me/saved` | 400 | b3, q-page | C | C |
| E41 | `GET /api/me/saved` | 401 | b3, q-authz | C | C |
| E42 | `GET /api/me/saved/ids` | 200 all ids, newest first | b3, q-page | C | C |
| E43 | `GET /api/me/saved/ids` | 401 | b3, q-authz | C | C |
| E44 | `PUT /api/me/saved/:postingId` | 201 then 200 | b3 | C | C |
| E45 | `PUT /api/me/saved/:postingId` | 400 | none → q-input | M | C |
| E46 | `PUT /api/me/saved/:postingId` | 401 | b3, q-authz | C | C |
| E47 | `PUT /api/me/saved/:postingId` | 404 no such posting | b3, q-page | C | C |
| E48 | `DELETE /api/me/saved/:postingId` | 204 | b3 | C | C |
| E49 | `DELETE /api/me/saved/:postingId` | 400 | none → q-input | M | C |
| E50 | `DELETE /api/me/saved/:postingId` | 401 | b3, q-authz | C | C |
| E51 | `DELETE /api/me/saved/:postingId` | 404 not saved | b3, q-authz | C | C |
| E52 | `DELETE /api/me` | 204, clears the cookie | b4 | C | C |
| E53 | `DELETE /api/me` | 400 `fields.password` | b4, q-authz | C | C |
| E54 | `DELETE /api/me` | 401 | b3, q-authz | C | C |
| E55 | `DELETE /api/me` | 429 | none → q-abuse | M | C |
| E56 | `POST /api/postings` | 201 / 400 / 401 | b3, q-input, q-authz | C | C |
| E57 | `PUT /api/postings/:id` | 200 / 401 / 404 (missing or not yours) | b3, q-authz | C | C |
| E58 | `PUT /api/postings/:id` | 400 | b3 (body), q-input (ids) | P | C |
| E59 | `DELETE /api/postings/:id` | 204 / 401 / 404 | b3, q-authz | C | C |
| E60 | `DELETE /api/postings/:id` | 400 | none → q-input | M | C |
| E61 | conventions | times are ISO 8601 UTC | response schemas parsed in b3 (`z.iso.datetime()`); q-page (createdAt kept on edit) | P | C |

## 5. Legacy acceptance flows

All 18 run in order in `e2e/legacy-flows.spec.ts` against the real API, in both the desktop (1280 px) and mobile (375 px) projects. Deliberate differences are listed at the top of that file (real paths, public market, toasts, an edit page).

| # | Flow | Before | After |
|---|---|---|---|
| 1 | Guest landing renders | C | C |
| 2 | Guest deep link: `/market` public, `/mylistings` asks to log in | C | C |
| 3 | Non-hash path `/about` serves the SPA | C | C |
| 4 | Register: short password blocked client-side | C | C |
| 5 | Register: duplicate username message | C | C |
| 6 | Register: signed in, lands on market | C | C |
| 7 | Market: formatted prices, no foreign edit buttons | C | C |
| 8 | Create: `javascript:` image rejected client-side | C | C |
| 9 | Create: valid listing shows first | C | C |
| 10 | Edit: price pre-filled as dollars, saves | C | C |
| 11 | Stored XSS renders as text | C (title, description, market only) | C (+ e2e:qa-sec, every field and page) |
| 12 | Deep-link reload keeps the session | C | C |
| 13 | Delete own listing | C | C |
| 14 | Expired session → login, no request loop | C | C |
| 15 | Login: wrong password message | C | C |
| 16 | Login then logout | C | C (race fixed, see flake hunt) |
| 17 | No horizontal scroll; phone menu works | C | C |
| 18 | Rate limit shows "Too many attempts" | C | C |

## 6. "As researched": verified locally

Measured 2026-10-24 on an Apple Silicon Mac (darwin/arm64, Node 26.12), with the production build from `vite build`.

| Constraint (plan §2) | Local result |
|---|---|
| C1/C3 password paths ≤ ~10 ms CPU | `npm run build && node src/worker/bench/login-cpu.mjs 50` (built Worker in workerd, sequential, wall time incl. local D1, Apple M5) at **50,000 iterations**: native PBKDF2-SHA256 50k p50 3.5 ms; `GET /api/health` p50 0.5 ms; **login success p50 4.4 / p95 4.9 ms**; login unknown user p50 4.1 / p95 6.1 ms; **register p50 4.5 / p95 5.3 ms**; **password change (two derivations) p50 7.0 / p95 7.8 ms** (three runs of 50, final pre-launch code). At 100k the password change measured about 12-14 ms, which is why the count was halved. Cloudflare's cores may be slower, so production `cpuTime` (post-deploy item 1) decides |
| C2 PBKDF2 capped at 100,000 in workerd | `PBKDF2_ITERATIONS = 50_000` (below the cap); pw asserts both; q-abuse sees exactly `PBKDF2_ITERATIONS` per login; stored hashes with any count up to 100,000 still verify and are re-hashed on login |
| C4 D1 FKs on by default; STRICT tables | Local D1 via `wrangler d1 migrations apply --local` then `wrangler d1 execute --local`: all 6 app tables `strict = 1`, `PRAGMA foreign_keys = 1`, an orphan insert fails with `SQLITE_CONSTRAINT_FOREIGNKEY`, TEXT into an INTEGER column fails with `SQLITE_CONSTRAINT_DATATYPE`. Remote D1: post-deploy |
| C8 `_headers` applies to assets only; API headers from Hono | e2e:security-headers (both sides) |
| C9 Vite plugin layout, `run_worker_first: ["/api/*"]` | e2e:smoke (deep link → index.html; unknown `/api/x` → JSON 404) |
| C10 Turnstile CSP (`script-src`, `frame-src` challenges.cloudflare.com) | e2e:turnstile-real (real widget under the enforced CSP) |
| C14 Hono `csrf()` doesn't cover JSON → own Origin check | b1, q-sess |
| No `.map` / MSW in `dist` | e2e:build-hygiene; manual check: 0 `.map` files, no `mockServiceWorker.js`, no `msw`/`sourceMappingURL` strings anywhere in `dist/` |
| ≤ 500 kB per chunk | e2e:build-hygiene; manual check: 23 client chunks, largest 248.9 kB (`index-*.js`, 78 kB gzipped), next 201.4 kB; the Worker bundle is 293 kB |
| Enforced CSP = §4 | `dist/client/_headers` CSP is byte-identical to the §4 string; `_headers` adds `X-Frame-Options: DENY` on top |
| `__Host-` cookie | q-sess (attributes on every Set-Cookie, no Domain); e2e:qa-sec: Chromium on `http://localhost:4173` stores it host-only, Secure, HttpOnly, SameSite=Lax, 7-day expiry, invisible to `document.cookie`, gone after logout |

## Post-deploy checklist

Only a real deploy can answer these:

1. **Password-path CPU:** run ~50 logins and a few password changes against `workers.dev` and read `cpuTime` (Workers Observability or `wrangler tail`). p95 should stay under ~10 ms with no Error 1102, including the password change (two derivations); otherwise go passkey-first (plan §4).
2. **D1 remote:** `wrangler d1 migrations apply DB --remote` succeeds (STRICT accepted), then `wrangler d1 execute DB --remote --command "SELECT name, strict FROM pragma_table_list"` shows `strict = 1` and `PRAGMA foreign_keys` is 1.
3. **Rate Limiting binding** deployed on the Free plan (`AUTH_LIMITER`); if not, remove it and rely on the D1 throttle.
4. **`__Host-` cookie over real HTTPS:** after login, the browser shows `__Host-keebhub_session` (Secure, HttpOnly, SameSite=Lax, no Domain) for `keebhub.<acct>.workers.dev` only.
5. **`cf-connecting-ip`** is the real client IP (the per-IP limits key on it); check one throttle row after a failed login.
6. **Turnstile:** the real widget for the `workers.dev` hostname issues tokens that siteverify accepts with the production secret, and a bad token gets 403.
7. **HIBP** reachable from the Worker (a known-breached password such as `password1234` is refused on register).
8. **Headers:** `curl -sI https://keebhub.<acct>.workers.dev/` shows the enforced CSP and the other `_headers`; `curl -sI .../api/health` shows the API headers and `no-store`.
9. **Caching:** responses that set the session cookie are `no-store` at the edge too (`curl -si` an authenticated `/api/switches` after the half-life, or check the code path in logs).
10. **Read-only smoke against the deployed URL** (Q-C.9): `/`, `/market`, `/api/health`, `/api/switches`, a deep link, an unknown `/api/x` (JSON 404).
11. **Billing:** Free plan, no payment method; D1 Time Travel available.
12. **Observability:** no CSP reports or 5xx in the first day; auth logs contain only username hashes.

## Bugs found by this pass

| # | Severity | Where | What | Status |
|---|---|---|---|---|
| 1 | Medium | `src/shared/schemas.ts` `ImageUrl` | `https:host/x`, `https:/host/x`, `https:\\host\x` pass `new URL()` as https, so the schema accepted them, then the D1 CHECK `image_url LIKE 'https://%'` failed and `POST/PUT /api/postings` answered **500**. The forms accepted them too | Fixed, 56a17f2 |
| 2 | Medium | `src/worker/middleware/security.ts` | `GET /api/switches` and `/api/config` are `Cache-Control: public, max-age=300`, and the session middleware can add a `Set-Cookie` (a refresh carrying the full session token, or a clear) to any response: shared caches were told they may store another user's session cookie | Fixed, 027d535 |
| 3 | Medium | `src/client/lib/safeNext.ts` | Open redirect: `?next=/.//evil.com` (also `/..//`, `/a/..//`, `/%2e//`) normalizes to `//evil.com`. A signed-in user opening `/login?next=/.//evil.com` was redirected to `http://evil.com/` by the guest-only loader; logging in from such a link threw "External navigation is not allowed" and left the user on /login | Fixed, 9aab2ce |

Not fixed (low, for routing):

- `app.onError` doesn't map SQLite `CHECK`/`UNIQUE` failures to 400/409 as plan §3 describes; they are 500s. After bug 1 no known input reaches one.
- `postings` and `users` use `INTEGER PRIMARY KEY` without `AUTOINCREMENT`, so SQLite reuses the highest id after it is deleted: a bookmark to a deleted newest listing can later open a different listing. Cascades keep data consistent (q-page checks a re-registered name starts clean).
- `docs/api.md` says non-digit limits are 400; a 10+ digit limit is also 400 (`^\d{1,9}$`).
- `e2e/turnstile-real.spec.ts` registers from the runner's own IP (it can't override `cf-connecting-ip`), so `--repeat-each` above 5 hits the 5-per-hour register limit. Normal runs register once.

## Flake hunt

| Run | Result |
|---|---|
| Full suite, `--repeat-each=5` | 540 passed, 30 skipped, 0 failed |
| Full suite, `--repeat-each=2` with 12 busy-loop processes on 10 cores | 216 passed, 12 skipped, 0 failed |
| Mobile, `--repeat-each=4`, 8x Chrome CPU throttling | 192 passed, 12 skipped, 0 failed |
| Nav-heavy specs, mobile, `--repeat-each=8`, **30x** CPU throttling | reproduced: `expect(locator).toBeVisible()` on the nav's "Log in" link after logout (legacy flow 16 ×2, auth.spec logout ×3), plus 30 s test timeouts from the throttling itself |
| Same specs + e2e:qa-sec after the fix, 30x, `--repeat-each=4`, `--timeout=120000` | 144 passed, 0 failed |
| auth.spec logout test alone after the fix, 30x, `--repeat-each=20` | 20 passed (before the fix it failed 3 of 8 at 30x) |

**Root cause:** the phone nav closes its menu in a `useEffect` keyed on `location.pathname`. After logout, the URL changes to `/` before React commits the home route; the tests then called `openMenuIfNeeded`, which read `aria-expanded` once: it either saw the stale "true" (menu still open from clicking Log out) and did nothing, or opened it, and in both cases the late effect closed the menu, so the "Log in" link was hidden. Waiting for the toast didn't help (it renders before the route commits).

**Fix (tests only):** `logOutInUi` in `e2e/fixtures.ts` waits for the home heading and, on phones, for the menu to have closed itself (`aria-expanded="false"`, skipped when logging out from `/`, where the path doesn't change); `openMenuIfNeeded` now asserts the menu is open and the nav visible instead of only clicking; flows that land on `/market` wait for its heading before touching the menu. `E2E_CPU_THROTTLE=<rate>` stays as an opt-in knob for future hunts.

# keebhub API

The Worker serves everything under `/api/*`; every other path is the SPA. Types for every request and response are in [`src/shared/schemas.ts`](../src/shared/schemas.ts), and `hc<AppType>` (from `src/worker/index.ts`) gives a fully typed client: `api.api.postings.$get({ query: { limit: "20" } })`.

## Conventions

- **Same origin only.** No CORS. `POST`, `PUT`, `PATCH` and `DELETE` must carry `Origin: <this origin>` or `Sec-Fetch-Site: same-origin` (browsers send these automatically for `fetch`). Otherwise the response is **403** `forbidden`.
- **JSON only.** A request body must be `Content-Type: application/json`, or the response is **415** `unsupported_media_type`. Bodyless requests (e.g. `PUT /api/me/saved/1`) may omit the header. Bodies over 100 KB get **413** `payload_too_large`. Malformed JSON gets **400**.
- **Session.** A cookie, `__Host-keebhub_session` (HttpOnly, Secure, SameSite=Lax, Path=/). The browser sends it automatically; the SPA never reads it. It lasts 7 days from the last use (renewed once past the half-way point) and at most 30 days from sign-in. Routes marked 🔒 answer **401** `unauthorized` without a valid session.
- **Errors** always have this shape (`ApiError`):

  ```json
  { "error": { "code": "validation_failed", "message": "Invalid request", "fields": { "password": ["Password must be at least 8 characters"] } } }
  ```

  `code` is one of `validation_failed` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `payload_too_large` (413), `unsupported_media_type` (415), `rate_limited` (429, with a `Retry-After` header in seconds), `listing_limit` (429, see [Listing limits](#listing-limits)), `unavailable` (503), `internal` (500). `fields` (field name to messages) is present on validation errors; field names match the request body keys.
- **Caching.** Responses are `Cache-Control: no-store` unless listed otherwise.
- **Ids** in paths are positive integers up to 2147483647; anything else is **400**.
- **Paging** (`PageQuery`): `?limit=` (default 20, clamped to 1..100; non-digits are 400) and `?cursor=` (opaque; pass back `nextCursor` unchanged; a bad cursor is 400). Paged responses are `{ "items": [...], "nextCursor": "..." | null }`; `null` means there are no more items.
- **Money** is integer cents (`priceCents: 19999` is $199.99). Use `parseDollarsToCents` / `formatPrice` from `src/shared/money.ts`.
- **Times** are ISO 8601 strings in UTC.

### Shapes

```ts
User              = { id: number; username: string }
PostingWithSeller = { id, userId, title, description, imageUrl, priceCents,
                      createdAt, updatedAt, sellerUsername }   // userId is for owner checks
SavedPosting      = PostingWithSeller & { savedAt: string }
SavedListing      = { postingId: number; savedAt: string }
Switch            = { id, name, manufacturer, type: "linear" | "tactile" | "clicky",
                      description, imageUrl: string | null }
```

## Public

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/health` | | 200 `{ status: "ok" }` | 503 `unavailable` |
| `GET /api/config` | | 200 `PublicConfig` `{ turnstileSiteKey }` · cached 5 min | |
| `GET /api/switches` | | 200 `SwitchList` `{ items: Switch[] }`, by name · cached 5 min | |
| `GET /api/postings` | `?limit&cursor` | 200 `PostingPage`, newest first | 400 |
| `GET /api/postings/:id` | | 200 `PostingWithSeller` | 400, 404 |

## Auth (`/api/auth`)

Register and login need a Turnstile token from the widget (site key from `GET /api/config`), rendered with `data-action="register"` on the register form and `data-action="login"` on the login form. The server verifies it before writing anything, and refuses (403) a token Cloudflare doesn't confirm, one solved on another hostname, or one issued for the other form. Results from Cloudflare's test keys are accepted only on `localhost`.

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `POST /api/auth/register` | `RegisterInput` `{ username, password, turnstileToken }` | 201 `UserResponse` `{ user }`, and signs in (sets the cookie) | 400 (`fields.username` / `fields.password`, including a breached password), 403 bot check failed, 409 username taken (case-insensitive; `fields.username`), 429 |
| `POST /api/auth/login` | `LoginInput` `{ username, password, turnstileToken }` | 200 `UserResponse` `{ user }`, sets a new session cookie | 400 malformed, 401 wrong username or password (same body either way), 403 bot check failed, 429 |
| `POST /api/auth/logout` | (no body) | 204, clears the cookie; always succeeds | |
| `GET /api/auth/me` 🔒 | | 200 `User` `{ id, username }` | 401 |
| `POST /api/auth/password` 🔒 | `ChangePasswordInput` `{ currentPassword, newPassword }` | 204. Signs out every **other** session; this one stays | 400 (`fields.currentPassword` wrong, `fields.newPassword` invalid or breached), 401, 429 |

Rules (from `src/shared`): usernames are 3-32 of letters, digits, `.`, `_`, `-`, starting with a letter or digit, and unique ignoring case; passwords are 8-128 characters with no other rules, but known-breached passwords are refused.

Limits (per IP means the IPv4 address, or the IPv6 /64):

- **Login, per username + IP:** 10 failures in 15 minutes lock that username *from that IP* for 15 minutes, so nobody can lock someone else out by guessing from elsewhere. A successful login from that IP clears the count.
- **Login, per username from any IP:** 100 failures in an hour lock the username for 15 minutes (a backstop against distributed guessing).
- **Login, per IP:** 30 failures in 15 minutes lock the IP for 15 minutes.
- **Register, per IP:** 5 an hour.
- **Password change and account deletion, per session:** 5 wrong passwords in 15 minutes lock both forms for that session for 15 minutes. Login lockouts don't block them, and their failures don't lock login.
- **Login, register and password change** also allow about 10 requests a minute per IP.

All of these answer **429** `rate_limited` with `Retry-After`.

## Signed-in user (`/api/me`, all 🔒)

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/me/postings` | `?limit&cursor` | 200 `PostingPage` of the user's postings, newest first | 400, 401 |
| `GET /api/me/saved` | `?limit&cursor` | 200 `SavedPostingPage`, most recently saved first | 400, 401 |
| `GET /api/me/saved/ids` | | 200 `SavedIds` `{ ids: number[] }`: every saved posting id, newest save first, no cap (for Save toggles) | 401 |
| `PUT /api/me/saved/:postingId` | (no body) | 201 `SavedListing` when added, 200 `SavedListing` if already saved | 400, 401, 404 no such posting |
| `DELETE /api/me/saved/:postingId` | | 204 | 400, 401, 404 not saved |
| `DELETE /api/me` | `DeleteAccountInput` `{ password }` | 204. Deletes the account with its postings, saved listings and sessions; clears the cookie | 400 (`fields.password` wrong), 401, 429 |

## Postings (writes, 🔒)

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `POST /api/postings` | `PostingInput` `{ title, description?, imageUrl, priceCents }` | 201 `PostingWithSeller` | 400, 401, 429 `listing_limit` |
| `PUT /api/postings/:id` | `PostingInput` | 200 `PostingWithSeller` | 400, 401, 404 (missing **or not yours**) |
| `DELETE /api/postings/:id` | | 204 | 400, 401, 404 (missing or not yours) |

`imageUrl` must be `https://` (no credentials, max 2048 chars). For the create/edit form, `PostingFormInput` validates a dollar string and outputs a `PostingInput`.

### Listing limits

`POST /api/postings` checks two limits (`src/shared/limits.ts`) before writing anything. Over either, it answers **429** with code **`listing_limit`** and a message to show as is:

| Limit | Constant | Message | `Retry-After` |
|---|---|---|---|
| 50 active listings per user | `LISTINGS_ACTIVE_MAX` | `You can have up to 50 active listings. Delete one to post another.` | none (deleting one frees a slot) |
| 20 creates per rolling hour per user (deleted listings still count) | `LISTINGS_CREATED_PER_HOUR_MAX`, `LISTINGS_RATE_WINDOW_SECONDS` | `You can post up to 20 listings an hour. Try again in N minutes.` (`1 minute` when N is 1) | seconds until the oldest create in the hour drops out |

```json
{ "error": { "code": "listing_limit", "message": "You can post up to 20 listings an hour. Try again in 12 minutes." } }
```

Editing (`PUT`) and deleting don't count against either limit.

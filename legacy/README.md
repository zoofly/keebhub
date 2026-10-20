> **Legacy app.** This is the original CRA + Express + Postgres keebhub, kept in `legacy/` with its own `package.json` until the Cloudflare rewrite (repo root, see [`../docs/modernization-plan.md`](../docs/modernization-plan.md)) cuts over. Run every command below from this `legacy/` directory (`cd legacy && npm ci`). It will be deleted at cutover.


# EDA Project
This version uses React, Redux, Express, Passport, and PostgreSQL (a full list of dependencies can be found in `package.json`).

We **STRONGLY** recommend following these instructions carefully. It's a lot, and will take some time to set up, but your life will be much easier this way in the long run.

## Use the Template for This Repository (Don't Clone)

- Don't Fork or Clone. Instead, click the `Use this Template` button, and make a copy to your personal account.


## Prerequisites

Before you get started, make sure you have the following software installed on your computer:

- [Node.js](https://nodejs.org/en/)
- [PostrgeSQL](https://www.postgresql.org/)
- [Nodemon](https://nodemon.io/)

## Create database and tables

Create a database called `keebhub` and run [`database.sql`](./database.sql) in it. It creates the `user`, `postings`, `switches` and `saved_listings` tables plus their indexes. Every statement uses `IF NOT EXISTS`, so it is safe to re-run (for example to add the indexes to an existing database), but it will not add new columns or constraints to tables that already exist.

> The `postings`, `switches` and `saved_listings` definitions were reconstructed from how the code uses them; the originals were never committed. Compare them with the Heroku database before migrating it.

## Configuration

Put these in `.env` for local development (Heroku sets `DATABASE_URL` and `PORT` itself):

| Variable | Default | Purpose |
| --- | --- | --- |
| `SERVER_SESSION_SECRET` | random per process (dev only) | Cookie signing secret, 32+ chars. **Required in production.** |
| `DATABASE_URL` | unset | Full Postgres connection string. Takes priority over the `PG*` variables. |
| `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` | `localhost` / `5432` / `keebhub` / OS user / none | Standard libpq settings, used when `DATABASE_URL` is unset. |
| `DATABASE_SSL` | on when running on Heroku, off otherwise | `true`/`false` to force TLS to Postgres on or off. |
| `PG_POOL_MAX` | `10` | Connections per dyno. Keep `PG_POOL_MAX` x dynos under your plan's connection limit. |
| `PG_CONNECTION_TIMEOUT_MS` / `PG_IDLE_TIMEOUT_MS` / `PG_STATEMENT_TIMEOUT_MS` | `5000` / `30000` / `10000` | Pool timeouts. |
| `PORT` | `5000` | HTTP port. On macOS, AirPlay Receiver already listens on 5000; use e.g. `PORT=5055`. |
| `UV_THREADPOOL_SIZE` | `4` | Node's thread pool, where bcrypt hashing runs. Raise it (e.g. `8`) if logins are CPU-bound. |
| `AUTH_RATE_LIMIT_MAX` | `20` | Login/register attempts per IP per 15 minutes. Only raise it for load testing. |
| `SHUTDOWN_TIMEOUT_MS` | `25000` | How long to drain requests after SIGTERM before forcing exit. |

## Development Setup Instructions

- Run `npm install`
- Create the database and tables (above), or use the throwaway local Postgres described below
- Create a `.env` file at the root of the project and paste this line into the file:
  ```
  SERVER_SESSION_SECRET=superDuperSecret
  ```
  While you're in your new `.env` file, take the time to replace `superDuperSecret` with some long random string like `25POUbVtx6RKVNWszd9ERB9Bb6` to keep your application secure. Here's a site that can help you: [https://passwordsgenerator.net/](https://passwordsgenerator.net/). If you don't do this step, create a secret with less than eight characters, or leave it as `superDuperSecret`, you will get a warning.
- Start postgres if not running already by using `brew services start postgresql`
- Run `npm run server`
- Run `npm run client`
- Navigate to `localhost:3000`

## API

All bodies are JSON. Errors are JSON too: `{ "error": "<message>" }`. Routes marked *auth* answer `403` when not logged in. `:id` must be a positive integer or the route answers `400`.

| Route | Auth | Success | Other statuses |
| --- | --- | --- | --- |
| `POST /api/user/register` `{username, password}` | | `201` `{id, username}` | `400` invalid, `409` username taken, `429` rate limited |
| `POST /api/user/login` `{username, password}` | | `200` | `401` bad credentials, `429` rate limited |
| `POST /api/user/logout` | | `200` | |
| `GET /api/user` | auth | `200` `{id, username}` | |
| `GET /market?limit=&offset=` | auth | `200` array of postings, newest first | `400` bad limit/offset |
| `POST /market` `{title, description, image, price}` | auth | `201` created posting | `400` invalid |
| `PUT /market/:id` (same body) | auth, owner | `200` updated posting | `400`, `404` not found or not yours |
| `DELETE /market/:id` | auth, owner | `204` | `400`, `404` |
| `GET /mylistings` | auth | `200` your postings, newest first | |
| `GET /switches` | | `200` switch catalog (cacheable 5 min) | |
| `GET /saved` | auth | `200` your saved listings with posting details | |
| `POST /saved` `{posting_id}` | auth | `201` saved row (`200` if already saved) | `400`, `404` no such posting |
| `DELETE /saved/:id` | auth, owner | `204` | `400`, `404` |
| `GET /healthz` | | `200` `{status: "ok"}` | `503` database unreachable |

A posting is `{id, user_id, title, description, image, price, created_at}`. `price` comes back as a string (Postgres `NUMERIC`, e.g. `"199.99"`).

`GET /market` returns at most 100 postings per request (`limit` defaults to 100 and is capped at 100). When there are more, the response has an `X-Next-Offset` header; request `?offset=<that value>` for the next page.

Unknown paths under `/api`, `/market`, `/mylistings`, `/saved` and `/switches` answer a JSON `404`. Any other `GET` that accepts HTML is served the React app's `index.html`, so client-side routes survive a reload.

## Server tests

```
npm run test:server
```

This runs `server/test/*.test.js` with `node:test` and supertest against the real Express app and an in-memory database ([pg-mem](https://github.com/oguimbal/pg-mem)), so no Postgres is needed. To run the same tests against a real Postgres, point `TEST_DATABASE_URL` at a **throwaway** database (its keebhub tables are dropped and recreated):

```
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/keebhub_test npm run test:server
```

`npm test` still runs the React tests only.

## Local Postgres without installing it

[`server/dev/embedded-db.mjs`](./server/dev/embedded-db.mjs) runs a real Postgres 17 from the `embedded-postgres` npm package. Keep it out of the repo by installing into a scratch directory:

```
mkdir -p ~/scratch/keebhub-pg && cd ~/scratch/keebhub-pg
npm init -y
npm install embedded-postgres@17.10.0-beta.17 bcryptjs@2.4.3 autocannon@7
# only if npm skipped install scripts (it prints an install-scripts warning):
(cd node_modules/@embedded-postgres/darwin-arm64 && node scripts/hydrate-symlinks.js)
cp /path/to/keebhub/server/dev/*.mjs .
node embedded-db.mjs /path/to/keebhub/database.sql --reset
```

(Use the `@embedded-postgres/<platform>` folder that matches your machine.) It listens on port 5432 (`PGPORT=5433` to change it), creates and seeds a `keebhub` database (21 users, 100 postings, 30 switches; `SEED_POSTINGS=2000` for more) and keeps running until Ctrl-C. Log in as `bench` / `benchpassword`. Then, in the repo:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/keebhub PORT=5055 npm run server
```

## Load testing

With the embedded database and server running (above), from the scratch directory:

```
node bench.mjs http://localhost:5055 my-run 15 50
```

It runs `GET /market` (with and without gzip), `GET /switches`, `POST /api/user/login`, and a mixed run of logins alongside `/switches`. Login answers `429` after 20 attempts per 15 minutes. To measure login throughput instead, start the server with `AUTH_RATE_LIMIT_MAX=100000000`, and never set that in production.

Results on an Apple M5 laptop (10 cores) with autocannon, Postgres and the server all on the same machine (50 connections for 10s; the mixed run uses 20 + 20). `before` is `feature/security-hardening`, `after` is this branch:

| Scenario | Before req/s | Before p99 | After req/s | After p99 |
| --- | --- | --- | --- | --- |
| `GET /market`, 100 postings (same 100 rows both) | 2,043 | 34 ms | 4,029 | 15 ms |
| `GET /market`, 2,000 postings (before: all 2,000 rows; after: first page of 100) | 239 | 247 ms | 4,019 | 14 ms |
| `GET /market` with gzip, 100 postings: bytes per response | 38.9 KB | | 2.2 KB | |
| `GET /switches` (30 rows) | 8,802 | 7 ms | 17,935 | 7 ms |
| `POST /api/user/login`, default limit: 19 x 200, then 429s | 33,144 | 2 ms | 39,836 | 2 ms |
| `POST /api/user/login`, limiter raised | 19.6 | 9,356 ms | 68 | 772 ms |
| `GET /switches` while 20 connections log in | 1 | 9,939 ms (14 timeouts) | 10,896 | 4 ms |

Most of the gain comes from no longer logging every result set to stdout, paging `/market`, hashing passwords with native bcrypt on the thread pool instead of blocking the event loop, and serving static files before (and API requests without) the session and filesystem lookups.

## Debugging

To debug, you will need to run the client-side separately from the server. Start the client by running the command `npm run client`. Start the debugging server by selecting the Debug button.

![VSCode Toolbar](documentation/images/vscode-toolbar.png)

Then make sure `Launch Program` is selected from the dropdown, then click the green play arrow.

![VSCode Debug Bar](documentation/images/vscode-debug-bar.png)

## Testing Routes with Postman

To use Postman with this repo, you will need to set up requests in Postman to register a user and login a user at a minimum.

Keep in mind that once you using the login route, Postman will manage your session cookie for you just like a browser, ensuring it is sent with each subsequent request. If you delete the `localhost` cookie in Postman, it will effectively log you out.

1. Start the server - `npm run server`
2. Import the sample routes JSON file [v2](./PostmanPrimeSoloRoutesv2.json) by clicking `Import` in Postman. Select the file.
3. Click `Collections` and `Send` the following three calls in order:
   1. `POST /api/user/register` registers a new user, see body to change username/password
   2. `POST /api/user/login` will login a user, see body to change username/password
   3. `GET /api/user` will get user information, by default it's not very much

After running the login route above, you can try any other route you've created that requires a logged in user!

## Production Build

Before pushing to Heroku, run `npm run build` in terminal. This will create a build folder that contains the code Heroku will be pointed at. You can test this build by typing `npm start`. Keep in mind that `npm start` will let you preview the production build but will **not** auto update.

- Start postgres if not running already by using `brew services start postgresql`
- Run `npm start`
- Navigate to `localhost:5000`

## Lay of the Land

There are a few videos linked below that show a walkthrough the client and sever setup to help acclimatize to the boilerplate. Please take some time to watch the videos in order to get a better understanding of what the boilerplate is like.

- [Initial Set](https://vimeo.com/453297271)
- [Server Walkthrough](https://vimeo.com/453297212)
- [Client Walkthrough](https://vimeo.com/453297124)

Directory Structure:

- `src/` contains the React application
- `public/` contains static assets for the client-side
- `build/` after you build the project, contains the transpiled code from `src/` and `public/` that will be viewed on the production site
- `server/` contains the Express App

This code is also heavily commented. We recommend reading through the comments, getting a lay of the land, and becoming comfortable with how the code works before you start making too many changes. If you're wondering where to start, consider reading through component file comments in the following order:

- src/components
  - App/App
  - Footer/Footer
  - Nav/Nav
  - AboutPage/AboutPage
  - InfoPage/InfoPage
  - UserPage/UserPage
  - LoginPage/LoginPage
  - RegisterPage/RegisterPage
  - LogOutButton/LogOutButton
  - ProtectedRoute/ProtectedRoute

## Deployment

1. Create a new Heroku project
1. Link the Heroku project to the project GitHub Repo
1. Create an Heroku Postgres database
1. Connect to the Heroku Postgres database from Postico
1. Create the necessary tables
1. Add an environment variable for `SERVER_SESSION_SECRET` with a nice random string for security
1. In the deploy section, select manual deploy

The server shuts down cleanly on Heroku's `SIGTERM` (it stops accepting connections, lets in-flight requests finish, then closes the database pool). `GET /healthz` checks the database and suits an uptime monitor.

## Update Documentation

Customize this ReadMe and the code comments in this project to read less like a starter repo and more like a project. Here is an example: https://gist.github.com/PurpleBooth/109311bb0361f32d87a2

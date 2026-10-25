// MSW handlers that stand in for the API in dev, e2e builds and component
// tests. They follow docs/api.md (backend branch) and the shared zod schemas:
// requests are validated with the same schemas the Worker uses, and every
// response body is parsed with its shared response schema before it's sent,
// so the mocks can't drift from the contract in src/shared.
import { delay, HttpResponse, http, passthrough } from "msw";
import type { z } from "zod";
import {
  type ApiError,
  ChangePasswordInput,
  DeleteAccountInput,
  type ErrorCode,
  IdParam,
  LoginInput,
  normalizeUsername,
  PageQuery,
  type Posting,
  PostingInput,
  PostingPage,
  PostingWithSeller,
  PublicConfig,
  RegisterInput,
  SavedIds,
  SavedListing,
  SavedPostingPage,
  SwitchList,
  User,
  UserResponse,
} from "../../shared/schemas";
import { db } from "./db";
import { MOCK_FAILING_TURNSTILE_TOKEN, MOCK_TURNSTILE_SITE_KEY } from "./fixtures";

/** Simulated network latency (browser dev only; tests run without it). */
let latencyMs = 0;
export function setMockLatency(ms: number) {
  latencyMs = ms;
}

/**
 * Listing caps, as on the API: at most 50 active listings per user, and at
 * most 20 created per rolling hour (the hourly case sends Retry-After).
 */
export const MAX_ACTIVE_LISTINGS = 50;
export const MAX_LISTINGS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

/** Same lockout as the API: 10 failures lock a username for 15 minutes. */
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_SECONDS = 15 * 60;

const error = (
  status: number,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string[]>,
  headers?: Record<string, string>,
) => {
  const body: ApiError = { error: fields ? { code, message, fields } : { code, message } };
  return HttpResponse.json(body, headers ? { status, headers } : { status });
};

/** Validates a response with its shared schema before sending it. */
const respond = <S extends z.ZodType>(schema: S, body: z.input<S>, status = 200) =>
  HttpResponse.json(schema.parse(body) as never, { status });

const noContent = () => new HttpResponse(null, { status: 204 });

/** JSON bodies only (415 otherwise), like the Worker. */
async function readJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) {
    throw error(415, "unsupported_media_type", "Send JSON");
  }
  try {
    return await request.json();
  } catch {
    throw error(400, "validation_failed", "Malformed JSON");
  }
}

/** 400 with `fields` keyed by request-body field, like the Worker. */
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "body");
      fields[key] = [...(fields[key] ?? []), issue.message];
    }
    throw error(400, "validation_failed", "Invalid request", fields);
  }
  return result.data;
}

function parseId(raw: string | readonly string[] | undefined): number {
  const id = IdParam.safeParse(raw);
  if (!id.success) {
    throw error(400, "validation_failed", "Invalid id");
  }
  return id.data;
}

function requireUser() {
  const { sessionUserId, users } = db.state;
  const user = users.find((candidate) => candidate.id === sessionUserId);
  if (!user) {
    throw error(401, "unauthorized", "Sign in required");
  }
  return user;
}

const publicUser = (user: { id: number; username: string }) => ({
  id: user.id,
  username: user.username,
});

function withSeller(posting: Posting) {
  const seller = db.state.users.find((user) => user.id === posting.userId);
  return { ...posting, sellerUsername: seller?.username ?? "former member" };
}

const toCursor = (n: number) =>
  btoa(String(n)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromCursor = (cursor: string) => Number(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));

/** Cursor paging, in the order given; the opaque cursor is the next offset. */
function paginate<T>(items: T[], url: URL) {
  const query = parse(PageQuery, Object.fromEntries(url.searchParams));
  let start = 0;
  if (query.cursor) {
    try {
      start = fromCursor(query.cursor);
    } catch {
      start = Number.NaN;
    }
  }
  if (!Number.isInteger(start) || start < 0) {
    throw error(400, "validation_failed", "Invalid cursor");
  }
  const end = start + query.limit;
  return { items: items.slice(start, end), nextCursor: end < items.length ? toCursor(end) : null };
}

const newestFirst = (postings: Posting[]) => [...postings].sort((a, b) => b.id - a.id);

/** Wraps a resolver: latency, test failure hooks, and thrown Responses. */
type Params = Record<string, string | readonly string[] | undefined>;
function route(
  resolver: (args: { request: Request; params: Params }) => Response | Promise<Response>,
) {
  return async ({ request, params }: { request: Request; params: Params }) => {
    if (latencyMs) {
      await delay(latencyMs);
    }
    const key = `${request.method} ${new URL(request.url).pathname}`;
    const failures = db.state.failNext[key] ?? 0;
    if (failures > 0) {
      db.state.failNext[key] = failures - 1;
      db.save();
      return error(500, "internal", "Internal server error");
    }
    try {
      return await resolver({ request, params });
    } catch (thrown) {
      if (thrown instanceof Response) {
        return thrown;
      }
      throw thrown;
    }
  };
}

function checkTurnstile(token: string) {
  if (token === MOCK_FAILING_TURNSTILE_TOKEN) {
    throw error(403, "forbidden", "Bot check failed");
  }
}

export const handlers = [
  // This branch's Worker really serves /api/health.
  http.get("/api/health", () => passthrough()),

  http.get(
    "/api/config",
    route(() => respond(PublicConfig, { turnstileSiteKey: MOCK_TURNSTILE_SITE_KEY })),
  ),

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  http.get(
    "/api/auth/me",
    route(() => respond(User, publicUser(requireUser()))),
  ),

  http.post(
    "/api/auth/register",
    route(async ({ request }) => {
      const input = parse(RegisterInput, await readJson(request));
      checkTurnstile(input.turnstileToken);
      const taken = db.state.users.some(
        (user) => normalizeUsername(user.username) === normalizeUsername(input.username),
      );
      if (taken) {
        return error(409, "conflict", "Username is taken", {
          username: ["That username is already taken"],
        });
      }
      const user = { id: db.nextId(), username: input.username, passphrase: input.password };
      db.state.users.push(user);
      db.state.sessionUserId = user.id;
      db.save();
      return respond(UserResponse, { user: publicUser(user) }, 201);
    }),
  ),

  http.post(
    "/api/auth/login",
    route(async ({ request }) => {
      const input = parse(LoginInput, await readJson(request));
      checkTurnstile(input.turnstileToken);
      const key = normalizeUsername(input.username);
      if ((db.state.failedLogins[key] ?? 0) >= MAX_FAILED_LOGINS) {
        return error(429, "rate_limited", "Too many attempts", undefined, {
          "Retry-After": String(LOCKOUT_SECONDS),
        });
      }
      const user = db.state.users.find(
        (candidate) => normalizeUsername(candidate.username) === key,
      );
      if (!user || user.passphrase !== input.password) {
        db.state.failedLogins[key] = (db.state.failedLogins[key] ?? 0) + 1;
        db.save();
        // Same body whether or not the username exists.
        return error(401, "unauthorized", "Invalid username or password");
      }
      delete db.state.failedLogins[key];
      db.state.sessionUserId = user.id;
      db.save();
      return respond(UserResponse, { user: publicUser(user) });
    }),
  ),

  // No body; always succeeds.
  http.post(
    "/api/auth/logout",
    route(() => {
      db.state.sessionUserId = null;
      db.save();
      return noContent();
    }),
  ),

  http.post(
    "/api/auth/password",
    route(async ({ request }) => {
      const user = requireUser();
      const input = parse(ChangePasswordInput, await readJson(request));
      if (input.currentPassword !== user.passphrase) {
        return error(400, "validation_failed", "Invalid request", {
          currentPassword: ["Current password is incorrect"],
        });
      }
      user.passphrase = input.newPassword;
      db.save();
      return noContent();
    }),
  ),

  // ---------------------------------------------------------------------------
  // Public catalog and postings
  // ---------------------------------------------------------------------------
  http.get(
    "/api/switches",
    route(() => {
      const items = [...db.state.switches].sort((a, b) => a.name.localeCompare(b.name));
      return respond(SwitchList, { items });
    }),
  ),

  http.get(
    "/api/postings",
    route(({ request }) => {
      const page = paginate(newestFirst(db.state.postings), new URL(request.url));
      return respond(PostingPage, { ...page, items: page.items.map(withSeller) });
    }),
  ),

  http.get(
    "/api/postings/:id",
    route(({ params }) => {
      const id = parseId(params.id);
      const posting = db.state.postings.find((candidate) => candidate.id === id);
      return posting
        ? respond(PostingWithSeller, withSeller(posting))
        : error(404, "not_found", "Not found");
    }),
  ),

  // ---------------------------------------------------------------------------
  // Posting writes
  // ---------------------------------------------------------------------------
  http.post(
    "/api/postings",
    route(async ({ request }) => {
      const user = requireUser();
      const input = parse(PostingInput, await readJson(request));
      const active = db.state.postings.filter((posting) => posting.userId === user.id).length;
      if (active >= MAX_ACTIVE_LISTINGS) {
        return error(
          429,
          "listing_limit",
          `You can have up to ${MAX_ACTIVE_LISTINGS} active listings. Delete one to post another.`,
        );
      }
      const nowMs = Date.now();
      const recent = db.state.postingsCreated
        .filter((row) => row.userId === user.id && nowMs - row.at < HOUR_MS)
        .map((row) => row.at)
        .sort((a, b) => a - b);
      const oldest = recent[0];
      if (recent.length >= MAX_LISTINGS_PER_HOUR && oldest !== undefined) {
        const retryAfter = Math.max(1, Math.ceil((oldest + HOUR_MS - nowMs) / 1000));
        return error(
          429,
          "listing_limit",
          `You can create up to ${MAX_LISTINGS_PER_HOUR} listings an hour.`,
          undefined,
          { "Retry-After": String(retryAfter) },
        );
      }
      db.state.postingsCreated.push({ userId: user.id, at: nowMs });
      const now = new Date(nowMs).toISOString();
      const posting: Posting = {
        id: db.nextId(),
        userId: user.id,
        ...input,
        createdAt: now,
        updatedAt: now,
      };
      db.state.postings.push(posting);
      db.save();
      return respond(PostingWithSeller, withSeller(posting), 201);
    }),
  ),

  http.put(
    "/api/postings/:id",
    route(async ({ request, params }) => {
      const user = requireUser();
      const id = parseId(params.id);
      const input = parse(PostingInput, await readJson(request));
      const posting = db.state.postings.find((candidate) => candidate.id === id);
      // Not yours looks exactly like missing (no existence leak).
      if (!posting || posting.userId !== user.id) {
        return error(404, "not_found", "Not found");
      }
      Object.assign(posting, input, { updatedAt: new Date().toISOString() });
      db.save();
      return respond(PostingWithSeller, withSeller(posting));
    }),
  ),

  http.delete(
    "/api/postings/:id",
    route(({ params }) => {
      const user = requireUser();
      const id = parseId(params.id);
      const posting = db.state.postings.find((candidate) => candidate.id === id);
      if (!posting || posting.userId !== user.id) {
        return error(404, "not_found", "Not found");
      }
      db.state.postings = db.state.postings.filter((candidate) => candidate.id !== id);
      db.state.saved = db.state.saved.filter((row) => row.postingId !== id);
      db.save();
      return noContent();
    }),
  ),

  // ---------------------------------------------------------------------------
  // Signed-in user
  // ---------------------------------------------------------------------------
  http.get(
    "/api/me/postings",
    route(({ request }) => {
      const user = requireUser();
      const mine = newestFirst(db.state.postings.filter((posting) => posting.userId === user.id));
      const page = paginate(mine, new URL(request.url));
      return respond(PostingPage, { ...page, items: page.items.map(withSeller) });
    }),
  ),

  http.get(
    "/api/me/saved",
    route(({ request }) => {
      const user = requireUser();
      const rows = db.state.saved
        .filter((row) => row.userId === user.id)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      const items = rows.flatMap((row) => {
        const posting = db.state.postings.find((candidate) => candidate.id === row.postingId);
        return posting ? [{ ...withSeller(posting), savedAt: row.savedAt }] : [];
      });
      return respond(SavedPostingPage, paginate(items, new URL(request.url)));
    }),
  ),

  http.get(
    "/api/me/saved/ids",
    route(() => {
      const user = requireUser();
      const ids = db.state.saved
        .filter((row) => row.userId === user.id)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map((row) => row.postingId);
      return respond(SavedIds, { ids });
    }),
  ),

  // No body. 201 when added, 200 if already saved.
  http.put(
    "/api/me/saved/:postingId",
    route(({ params }) => {
      const user = requireUser();
      const postingId = parseId(params.postingId);
      if (!db.state.postings.some((posting) => posting.id === postingId)) {
        return error(404, "not_found", "Not found");
      }
      const existing = db.state.saved.find(
        (row) => row.userId === user.id && row.postingId === postingId,
      );
      if (existing) {
        return respond(SavedListing, { postingId, savedAt: existing.savedAt }, 200);
      }
      const row = { userId: user.id, postingId, savedAt: new Date().toISOString() };
      db.state.saved.push(row);
      db.save();
      return respond(SavedListing, { postingId, savedAt: row.savedAt }, 201);
    }),
  ),

  // 204, or 404 if it wasn't saved.
  http.delete(
    "/api/me/saved/:postingId",
    route(({ params }) => {
      const user = requireUser();
      const postingId = parseId(params.postingId);
      const before = db.state.saved.length;
      db.state.saved = db.state.saved.filter(
        (row) => !(row.userId === user.id && row.postingId === postingId),
      );
      if (db.state.saved.length === before) {
        return error(404, "not_found", "Not found");
      }
      db.save();
      return noContent();
    }),
  ),

  http.delete(
    "/api/me",
    route(async ({ request }) => {
      const user = requireUser();
      const input = parse(DeleteAccountInput, await readJson(request));
      if (input.password !== user.passphrase) {
        return error(400, "validation_failed", "Invalid request", {
          password: ["Password is incorrect"],
        });
      }
      const state = db.state;
      const removed = new Set(state.postings.filter((p) => p.userId === user.id).map((p) => p.id));
      state.postings = state.postings.filter((posting) => posting.userId !== user.id);
      state.saved = state.saved.filter(
        (row) => row.userId !== user.id && !removed.has(row.postingId),
      );
      state.users = state.users.filter((candidate) => candidate.id !== user.id);
      state.sessionUserId = null;
      db.save();
      return noContent();
    }),
  ),

  // Anything else under /api is a JSON 404, like the Worker's notFound.
  http.all("/api/*", () => error(404, "not_found", "Not found")),
];

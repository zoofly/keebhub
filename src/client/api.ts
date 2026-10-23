// The only module that talks to the API. Everything else calls these
// functions (usually through the TanStack Query options in lib/queries.ts).
// The contract is docs/api.md on the backend branch (modernize/backend).
//
// /api/health goes through the typed Hono RPC client because this branch's
// Worker already serves it. The other routes aren't in this branch's
// `AppType` yet, so they use `request()` and validate every response with
// the shared zod schemas. After the tracks merge, each function body can
// become the matching `api.api.<route>.$get/$post(...)` call; the
// signatures and the ApiRequestError contract stay the same, so callers
// don't change.
import { hc } from "hono/client";
import type { z } from "zod";
import {
  ApiError,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type ErrorCode,
  type LoginInput,
  type PostingInput,
  PostingPage,
  PostingWithSeller,
  PublicConfig,
  type RegisterInput,
  SavedIds,
  SavedListing,
  SavedPostingPage,
  type Switch,
  SwitchList,
  User,
  UserResponse,
} from "../shared/schemas";
import type { AppType } from "../worker/index";

/** Typed client for the Worker API (same origin). */
export const api = hc<AppType>("/");

/** Why a request failed. `status` is 0 when the server couldn't be reached. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | "network" | "bad_response";
  readonly fields: Record<string, string[]>;
  /** Seconds from a Retry-After header (429), if the server sent one. */
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    code: ApiRequestError["code"],
    message: string,
    fields: Record<string, string[]> = {},
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isApiError(error: unknown, status?: number): error is ApiRequestError {
  return error instanceof ApiRequestError && (status === undefined || error.status === status);
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

const absolute = (path: string) =>
  // Relative URLs work in browsers; Node's fetch (component tests) needs an origin.
  typeof window === "undefined" ? path : new URL(path, window.location.origin).href;

const parseRetryAfter = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000));
};

async function toError(res: Response): Promise<ApiRequestError> {
  const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
  const body = ApiError.safeParse(await res.json().catch(() => null));
  if (body.success) {
    const { code, message, fields } = body.data.error;
    return new ApiRequestError(res.status, code, message, fields ?? {}, retryAfter);
  }
  return new ApiRequestError(
    res.status,
    "internal",
    `Request failed (${res.status})`,
    {},
    retryAfter,
  );
}

/**
 * Sends one JSON request (same origin, so the session cookie goes along)
 * and validates the response with `schema`. Request bodies and responses
 * are never logged.
 */
async function request<S extends z.ZodType>(
  method: Method,
  path: string,
  options: { body?: unknown; schema: S; signal?: AbortSignal | undefined },
): Promise<z.output<S>>;
async function request(
  method: Method,
  path: string,
  options?: { body?: unknown; signal?: AbortSignal | undefined },
): Promise<void>;
async function request(
  method: Method,
  path: string,
  options: { body?: unknown; schema?: z.ZodType; signal?: AbortSignal | undefined } = {},
): Promise<unknown> {
  // Same-origin fetch: the browser adds Origin / Sec-Fetch-Site, which the
  // API checks on writes. Bodies are always JSON (anything else is a 415);
  // bodyless requests send no Content-Type, which the API allows.
  const init: RequestInit = { method, credentials: "same-origin" };
  if (options.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  if (options.signal) {
    init.signal = options.signal;
  }

  let res: Response;
  try {
    res = await fetch(absolute(path), init);
  } catch (err) {
    if (options.signal?.aborted) {
      throw err;
    }
    throw new ApiRequestError(0, "network", "Could not reach the server");
  }

  if (!res.ok) {
    throw await toError(res);
  }
  if (!options.schema) {
    return undefined;
  }
  const parsed = options.schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiRequestError(res.status, "bad_response", "Unexpected response from the server");
  }
  return parsed.data;
}

const pageQuery = (params: { limit: number; cursor?: string | undefined }) => {
  const search = new URLSearchParams({ limit: String(params.limit) });
  if (params.cursor) {
    search.set("cursor", params.cursor);
  }
  return search.toString();
};

type PageParams = { limit: number; cursor?: string | undefined; signal?: AbortSignal | undefined };

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function getHealth(signal?: AbortSignal): Promise<boolean> {
  const res = await api.api.health.$get(undefined, signal ? { init: { signal } } : {});
  return res.status === 200;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** The signed-in user, or null when there is no (valid) session. */
export async function getMe(signal?: AbortSignal): Promise<User | null> {
  try {
    return await request("GET", "/api/auth/me", { schema: User, signal });
  } catch (err) {
    if (isApiError(err, 401)) {
      return null;
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<User> {
  const { user } = await request("POST", "/api/auth/login", {
    body: input,
    schema: UserResponse,
  });
  return user;
}

export async function register(input: RegisterInput): Promise<User> {
  const { user } = await request("POST", "/api/auth/register", {
    body: input,
    schema: UserResponse,
  });
  return user;
}

export function logout(): Promise<void> {
  return request("POST", "/api/auth/logout");
}

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return request("POST", "/api/auth/password", { body: input });
}

export function deleteAccount(input: DeleteAccountInput): Promise<void> {
  return request("DELETE", "/api/me", { body: input });
}

// ---------------------------------------------------------------------------
// Public config, catalog and postings
// ---------------------------------------------------------------------------

/** Runtime settings (the Turnstile site key), so builds aren't per-environment. */
export function getConfig(signal?: AbortSignal) {
  return request("GET", "/api/config", { schema: PublicConfig, signal });
}

export async function getSwitches(signal?: AbortSignal): Promise<Switch[]> {
  const { items } = await request("GET", "/api/switches", { schema: SwitchList, signal });
  return items;
}

export function getPostings({ signal, ...page }: PageParams) {
  return request("GET", `/api/postings?${pageQuery(page)}`, { schema: PostingPage, signal });
}

export function getPosting(id: number, signal?: AbortSignal) {
  return request("GET", `/api/postings/${id}`, { schema: PostingWithSeller, signal });
}

export function createPosting(input: PostingInput) {
  return request("POST", "/api/postings", { body: input, schema: PostingWithSeller });
}

export function updatePosting(id: number, input: PostingInput) {
  return request("PUT", `/api/postings/${id}`, { body: input, schema: PostingWithSeller });
}

export function deletePosting(id: number): Promise<void> {
  return request("DELETE", `/api/postings/${id}`);
}

export function getMyPostings({ signal, ...page }: PageParams) {
  return request("GET", `/api/me/postings?${pageQuery(page)}`, { schema: PostingPage, signal });
}

// ---------------------------------------------------------------------------
// Saved listings
// ---------------------------------------------------------------------------

export function getSaved({ signal, ...page }: PageParams) {
  return request("GET", `/api/me/saved?${pageQuery(page)}`, { schema: SavedPostingPage, signal });
}

/** Every posting id the signed-in user has saved, for the Save toggles. */
export async function getSavedIds(signal?: AbortSignal): Promise<number[]> {
  const { ids } = await request("GET", "/api/me/saved/ids", { schema: SavedIds, signal });
  return ids;
}

/** 201 when added, 200 if it was already saved; both are success. */
export function savePosting(postingId: number) {
  return request("PUT", `/api/me/saved/${postingId}`, { schema: SavedListing });
}

/**
 * 204, or 404 when it wasn't saved. The UI treats both as "not saved now",
 * so a double click or a stale tab can't show an error.
 */
export async function unsavePosting(postingId: number): Promise<void> {
  try {
    await request("DELETE", `/api/me/saved/${postingId}`);
  } catch (err) {
    if (!isApiError(err, 404)) {
      throw err;
    }
  }
}

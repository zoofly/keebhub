// The only module that talks to the API. Everything else calls these
// functions (usually through the TanStack Query options in lib/queries.ts).
// The contract is docs/api.md.
//
// Every call goes through the typed Hono RPC client (`hc<AppType>`), so
// paths, params, query strings and JSON bodies are checked against the
// Worker's routes at compile time. Responses are still validated with the
// shared zod schemas at runtime, and failures become ApiRequestError.
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

/**
 * Typed client for the Worker API (same origin). Built per call from the
 * page's origin, which browsers and the jsdom tests both provide.
 */
const client = () =>
  hc<AppType>(typeof window === "undefined" ? "http://localhost" : window.location.origin);

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
 * Runs one hc call and validates the response with `schema`. Request bodies
 * and responses are never logged. Same-origin fetch: the browser adds
 * Origin / Sec-Fetch-Site (checked on writes) and sends the session cookie;
 * hc sends JSON bodies as application/json and bodyless calls without a
 * Content-Type, which the API allows.
 */
async function send<S extends z.ZodType>(
  run: (init: RequestInit) => Promise<Response>,
  options: { schema: S; signal?: AbortSignal | undefined },
): Promise<z.output<S>>;
async function send(
  run: (init: RequestInit) => Promise<Response>,
  options?: { signal?: AbortSignal | undefined },
): Promise<void>;
async function send(
  run: (init: RequestInit) => Promise<Response>,
  options: { schema?: z.ZodType; signal?: AbortSignal | undefined } = {},
): Promise<unknown> {
  const init: RequestInit = { credentials: "same-origin" };
  if (options.signal) {
    init.signal = options.signal;
  }

  let res: Response;
  try {
    res = await run(init);
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

/** ?limit=&cursor= as hc query values (strings; no undefined keys). */
const pageQuery = (params: { limit: number; cursor?: string | undefined }) =>
  params.cursor
    ? { limit: String(params.limit), cursor: params.cursor }
    : { limit: String(params.limit) };

type PageParams = { limit: number; cursor?: string | undefined; signal?: AbortSignal | undefined };

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function getHealth(signal?: AbortSignal): Promise<boolean> {
  const res = await client().api.health.$get(undefined, signal ? { init: { signal } } : {});
  return res.status === 200;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** The signed-in user, or null when there is no (valid) session. */
export async function getMe(signal?: AbortSignal): Promise<User | null> {
  try {
    return await send((init) => client().api.auth.me.$get(undefined, { init }), {
      schema: User,
      signal,
    });
  } catch (err) {
    if (isApiError(err, 401)) {
      return null;
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<User> {
  const { user } = await send((init) => client().api.auth.login.$post({ json: input }, { init }), {
    schema: UserResponse,
  });
  return user;
}

export async function register(input: RegisterInput): Promise<User> {
  const { user } = await send(
    (init) => client().api.auth.register.$post({ json: input }, { init }),
    { schema: UserResponse },
  );
  return user;
}

export function logout(): Promise<void> {
  return send((init) => client().api.auth.logout.$post(undefined, { init }));
}

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return send((init) => client().api.auth.password.$post({ json: input }, { init }));
}

export function deleteAccount(input: DeleteAccountInput): Promise<void> {
  return send((init) => client().api.me.$delete({ json: input }, { init }));
}

// ---------------------------------------------------------------------------
// Public config, catalog and postings
// ---------------------------------------------------------------------------

/** Runtime settings (the Turnstile site key), so builds aren't per-environment. */
export function getConfig(signal?: AbortSignal) {
  return send((init) => client().api.config.$get(undefined, { init }), {
    schema: PublicConfig,
    signal,
  });
}

export async function getSwitches(signal?: AbortSignal): Promise<Switch[]> {
  const { items } = await send((init) => client().api.switches.$get(undefined, { init }), {
    schema: SwitchList,
    signal,
  });
  return items;
}

export function getPostings({ signal, ...page }: PageParams) {
  return send((init) => client().api.postings.$get({ query: pageQuery(page) }, { init }), {
    schema: PostingPage,
    signal,
  });
}

export function getPosting(id: number, signal?: AbortSignal) {
  return send(
    (init) => client().api.postings[":id"].$get({ param: { id: String(id) } }, { init }),
    { schema: PostingWithSeller, signal },
  );
}

export function createPosting(input: PostingInput) {
  return send((init) => client().api.postings.$post({ json: input }, { init }), {
    schema: PostingWithSeller,
  });
}

export function updatePosting(id: number, input: PostingInput) {
  return send(
    (init) =>
      client().api.postings[":id"].$put({ param: { id: String(id) }, json: input }, { init }),
    { schema: PostingWithSeller },
  );
}

export function deletePosting(id: number): Promise<void> {
  return send((init) =>
    client().api.postings[":id"].$delete({ param: { id: String(id) } }, { init }),
  );
}

export function getMyPostings({ signal, ...page }: PageParams) {
  return send((init) => client().api.me.postings.$get({ query: pageQuery(page) }, { init }), {
    schema: PostingPage,
    signal,
  });
}

// ---------------------------------------------------------------------------
// Saved listings
// ---------------------------------------------------------------------------

export function getSaved({ signal, ...page }: PageParams) {
  return send((init) => client().api.me.saved.$get({ query: pageQuery(page) }, { init }), {
    schema: SavedPostingPage,
    signal,
  });
}

/** Every posting id the signed-in user has saved, for the Save toggles. */
export async function getSavedIds(signal?: AbortSignal): Promise<number[]> {
  const { ids } = await send((init) => client().api.me.saved.ids.$get(undefined, { init }), {
    schema: SavedIds,
    signal,
  });
  return ids;
}

/** 201 when added, 200 if it was already saved; both are success. */
export function savePosting(postingId: number) {
  return send(
    (init) =>
      client().api.me.saved[":postingId"].$put(
        { param: { postingId: String(postingId) } },
        { init },
      ),
    { schema: SavedListing },
  );
}

/**
 * 204, or 404 when it wasn't saved. The UI treats both as "not saved now",
 * so a double click or a stale tab can't show an error.
 */
export async function unsavePosting(postingId: number): Promise<void> {
  try {
    await send((init) =>
      client().api.me.saved[":postingId"].$delete(
        { param: { postingId: String(postingId) } },
        { init },
      ),
    );
  } catch (err) {
    if (!isApiError(err, 404)) {
      throw err;
    }
  }
}

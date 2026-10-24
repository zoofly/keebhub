// Shared helpers for Worker integration tests (run in workerd via SELF).
import { SELF } from "cloudflare:test";
import { expect, vi } from "vitest";
import { SITEVERIFY_URL } from "../auth/turnstile";

export const ORIGIN = "https://keebhub.test";

// Obviously fake test-only values.
export const PASS_TOKEN = "turnstile-pass";
export const FAIL_TOKEN = "turnstile-fail";
export const GOOD_PASSWORD = "fake test words";
export const WRONG_PASSWORD = "wrong password";
export const OTHER_PASSWORD = "whatever words";

let ipCounter = 0;
/** A fresh client IP, so the per-IP limits of one test don't affect another. */
export const freshIp = (): string => {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}-${Date.now() % 100000}-${ipCounter}`;
};

export interface ApiOptions {
  method?: string;
  body?: unknown;
  rawBody?: BodyInit;
  contentType?: string | null;
  cookie?: string | null;
  ip?: string;
  origin?: string | null;
  headers?: Record<string, string>;
}

/** Calls the Worker like the SPA would: same-origin, JSON. */
export async function api(path: string, options: ApiOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const method =
    options.method ??
    (options.body === undefined && options.rawBody === undefined ? "GET" : "POST");
  if (options.origin !== null) {
    headers.set("origin", options.origin ?? ORIGIN);
  }
  if (options.ip) {
    headers.set("cf-connecting-ip", options.ip);
  }
  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }
  let body: BodyInit | undefined = options.rawBody;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
  }
  const contentType =
    options.contentType === undefined
      ? body !== undefined
        ? "application/json"
        : null
      : options.contentType;
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return SELF.fetch(`${ORIGIN}${path}`, { method, headers, body: body ?? null });
}

/** The session cookie pair ("name=value") from a response, if it set one. */
export function sessionCookie(res: Response): string | null {
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(";");
    if (pair?.startsWith("__Host-keebhub_session=") && !pair.endsWith("=")) {
      return pair;
    }
  }
  return null;
}

export function setCookieHeader(res: Response): string | undefined {
  return res.headers.getSetCookie().find((h) => h.startsWith("__Host-keebhub_session="));
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export interface OutboundMock {
  /** Passwords the fake HIBP API reports as breached. */
  pwned?: string[];
  /** Make the fake HIBP API unreachable. */
  hibpDown?: boolean;
  /** Make siteverify unreachable. */
  turnstileDown?: boolean;
}

/**
 * Replaces global fetch for outbound calls: Turnstile passes PASS_TOKEN and
 * fails anything else; HIBP answers from `pwned`. Anything else throws, so
 * no test can reach the network.
 */
export function mockOutbound(options: OutboundMock = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === SITEVERIFY_URL) {
      if (options.turnstileDown) {
        throw new TypeError("network down");
      }
      const form = await request.formData();
      return Response.json({ success: form.get("response") === PASS_TOKEN });
    }
    if (request.url.startsWith("https://api.pwnedpasswords.com/range/")) {
      if (options.hibpDown) {
        throw new TypeError("network down");
      }
      const prefix = request.url.slice(-5);
      const lines = ["0000000000000000000000000000000000A:0"];
      for (const password of options.pwned ?? []) {
        const hash = await sha1Hex(password.normalize("NFC"));
        if (hash.startsWith(prefix)) {
          lines.push(`${hash.slice(5)}:42`);
        }
      }
      return new Response(lines.join("\r\n"));
    }
    throw new Error(`Unexpected outbound fetch in test: ${request.url}`);
  });
}

/** Registers a user and returns the session cookie pair. */
export async function registerUser(
  username: string,
  password = GOOD_PASSWORD,
  ip = freshIp(),
): Promise<{ cookie: string; user: { id: number; username: string } }> {
  const res = await api("/api/auth/register", {
    body: { username, password, turnstileToken: PASS_TOKEN },
    ip,
  });
  if (res.status !== 201) {
    throw new Error(`register ${username} failed: ${res.status} ${await res.text()}`);
  }
  const cookie = sessionCookie(res);
  if (!cookie) {
    throw new Error("register set no cookie");
  }
  const body = (await res.json()) as { user: { id: number; username: string } };
  return { cookie, user: body.user };
}

export async function loginUser(
  username: string,
  password = GOOD_PASSWORD,
  ip = freshIp(),
  cookie: string | null = null,
): Promise<Response> {
  return api("/api/auth/login", {
    body: { username, password, turnstileToken: PASS_TOKEN },
    ip,
    cookie,
  });
}

export const validPosting = {
  title: "GMMK Pro",
  description: "Lubed and filmed",
  imageUrl: "https://example.com/gmmk.jpg",
  priceCents: 19999,
};

/** The session id (public half of the token) from a "name=<id>.<secret>" cookie pair. */
export const sessionIdFrom = (cookie: string): string => cookie.split("=")[1]?.split(".")[0] ?? "";

const TABLES = ["users", "sessions", "postings", "saved_listings", "auth_throttle"] as const;
export type Table = (typeof TABLES)[number];

/**
 * Every row of every app table, as JSON, so a test can assert that a refused
 * request wrote nothing at all (not just that a count stayed the same).
 */
export async function dbSnapshot(
  db: D1Database,
  tables: readonly Table[] = TABLES,
): Promise<Record<string, unknown[]>> {
  const statements = {
    users: "SELECT id, username, password_hash, created_at FROM users ORDER BY id",
    sessions:
      "SELECT id, hex(secret_hash) AS h, user_id, created_at, expires_at FROM sessions ORDER BY id",
    postings: "SELECT * FROM postings ORDER BY id",
    saved_listings: "SELECT * FROM saved_listings ORDER BY user_id, posting_id",
    auth_throttle: "SELECT * FROM auth_throttle ORDER BY key",
  } satisfies Record<Table, string>;
  const results = await db.batch(tables.map((table) => db.prepare(statements[table])));
  return Object.fromEntries(tables.map((table, i) => [table, results[i]?.results ?? []]));
}

/** Asserts the shared JSON error shape and returns the parsed body. */
export async function expectApiError(res: Response, status: number, code: string) {
  expect(res.status, `${res.url} -> ${status}`).toBe(status);
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  const body = (await res.json()) as {
    error: { code: string; message: string; fields?: Record<string, string[]> };
  };
  expect(Object.keys(body)).toEqual(["error"]);
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe("string");
  return body;
}

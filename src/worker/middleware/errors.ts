import type { Context, Env as HonoEnv } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError, ErrorCode } from "../../shared/schemas";
import type { AppEnv } from "../env";

/** Builds the `{ error: { code, message } }` body every API error uses. */
export function jsonError<E extends HonoEnv, S extends ContentfulStatusCode>(
  c: Context<E>,
  status: S,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string[]>,
) {
  const body: ApiError = {
    error: fields ? { code, message, fields } : { code, message },
  };
  return c.json(body, status);
}

const codeForStatus = (status: number): ErrorCode => {
  switch (status) {
    case 400:
      return "validation_failed";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 413:
      return "payload_too_large";
    case 415:
      return "unsupported_media_type";
    case 429:
      return "rate_limited";
    case 503:
      return "unavailable";
    default:
      return "internal";
  }
};

/** app.notFound: unknown /api routes get a JSON 404. */
export function notFound(c: Context<AppEnv>) {
  return jsonError(c, 404, "not_found", "Not found");
}

/**
 * Recognizes SQLite constraint failures from D1. These mean the request
 * carried data the schema refused, so they are client errors, not 500s.
 */
export function constraintKind(err: unknown): "unique" | "check" | null {
  if (!(err instanceof Error)) {
    return null;
  }
  const cause = err.cause instanceof Error ? err.cause.message : "";
  const text = `${err.message} ${cause}`;
  if (
    /UNIQUE constraint failed|PRIMARY KEY constraint failed|SQLITE_CONSTRAINT_(UNIQUE|PRIMARYKEY)/i.test(
      text,
    )
  ) {
    return "unique";
  }
  if (
    /(CHECK|NOT NULL) constraint failed|SQLITE_CONSTRAINT_(CHECK|NOTNULL|DATATYPE)|cannot store \S+ value in \S+ column/i.test(
      text,
    )
  ) {
    return "check";
  }
  return null;
}

/**
 * app.onError: HTTPExceptions keep their status with a generic message;
 * SQLite CHECK/NOT NULL/type failures become 400 validation_failed and
 * UNIQUE failures 409 conflict, with generic messages (never SQL); anything
 * else is a 500. Only 5xx are logged with the error (method, path, cf-ray;
 * never the body).
 */
export function onError(err: Error, c: Context<AppEnv>) {
  const constraint = constraintKind(err);
  if (constraint) {
    // A schema/validation mismatch worth knowing about, without the SQL.
    console.warn(
      JSON.stringify({
        message: "constraint violation",
        constraint,
        method: c.req.method,
        path: c.req.path,
        cfRay: c.req.header("cf-ray") ?? null,
      }),
    );
    return constraint === "unique"
      ? jsonError(c, 409, "conflict", "That conflicts with existing data")
      : jsonError(c, 400, "validation_failed", "Invalid request");
  }

  const status = err instanceof HTTPException ? err.status : 500;
  if (status >= 500) {
    console.error(
      JSON.stringify({
        message: "request failed",
        method: c.req.method,
        path: c.req.path,
        cfRay: c.req.header("cf-ray") ?? null,
        error: err.message,
      }),
    );
  }
  const code = codeForStatus(status);
  const message = status >= 500 ? "Internal server error" : err.message || code;
  return jsonError(c, status as ContentfulStatusCode, code, message);
}

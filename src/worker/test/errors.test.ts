// onError: SQLite constraint failures become 400/409 with generic bodies.
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../shared/schemas";
import type { AppEnv } from "../env";
import { constraintKind, onError } from "../middleware/errors";

const db = env.DB;

afterEach(() => vi.restoreAllMocks());

/** A tiny app with the real onError and routes that hit real D1 constraints. */
function appWith(statement: () => Promise<unknown>) {
  const app = new Hono<AppEnv>();
  app.onError(onError);
  app.post("/x", async () => {
    await statement();
    return new Response(null, { status: 204 });
  });
  return app;
}

const call = (app: Hono<AppEnv>) => app.request("/x", { method: "POST" }, env);

const leaks = /constraint|sqlite|insert|users|postings|check|unique|D1_/i;

describe("onError and SQLite constraints", () => {
  it("maps a CHECK failure to 400 validation_failed without SQL", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await call(
      appWith(() =>
        db.prepare("INSERT INTO users (username, password_hash) VALUES ('a', NULL)").run(),
      ),
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(ApiError.parse(JSON.parse(text))).toEqual({
      error: { code: "validation_failed", message: "Invalid request" },
    });
    expect(text).not.toMatch(leaks);
  });

  it("maps a STRICT type failure to 400", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await db.prepare("INSERT INTO users (username) VALUES ('typecheck')").run();
    const res = await call(
      appWith(() =>
        db
          .prepare(
            "INSERT INTO postings (user_id, title, image_url, price_cents) VALUES ((SELECT id FROM users WHERE username = 'typecheck'), 't', 'https://x.test/a.png', 'twelve')",
          )
          .run(),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("maps a UNIQUE failure to 409 conflict without SQL", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await db.prepare("INSERT INTO users (username) VALUES ('taken-name')").run();
    const res = await call(
      appWith(() => db.prepare("INSERT INTO users (username) VALUES ('TAKEN-NAME')").run()),
    );
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(ApiError.parse(JSON.parse(text)).error.code).toBe("conflict");
    expect(text).not.toMatch(leaks);
  });

  it("logs the constraint kind but not the SQL", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await call(
      appWith(() =>
        db.prepare("INSERT INTO users (username, password_hash) VALUES ('b', NULL)").run(),
      ),
    );
    const logged = warn.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(JSON.parse(logged)).toMatchObject({
      message: "constraint violation",
      constraint: "check",
    });
    expect(logged).not.toMatch(/INSERT|users/);
  });

  it("leaves other errors as a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(appWith(() => db.prepare("SELECT * FROM no_such_table").run()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal", message: "Internal server error" },
    });
  });

  it("recognizes the D1 error messages", () => {
    expect(
      constraintKind(
        new Error("D1_ERROR: UNIQUE constraint failed: users.username: SQLITE_CONSTRAINT"),
      ),
    ).toBe("unique");
    expect(
      constraintKind(
        new Error("D1_ERROR: CHECK constraint failed: length(username) BETWEEN 3 AND 32"),
      ),
    ).toBe("check");
    expect(
      constraintKind(
        new Error("x", { cause: new Error("NOT NULL constraint failed: postings.title") }),
      ),
    ).toBe("check");
    expect(constraintKind(new Error("network down"))).toBeNull();
    expect(constraintKind("not an error")).toBeNull();
  });
});

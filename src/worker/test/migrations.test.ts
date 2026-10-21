import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// setup.ts applied every migration to this file's fresh local D1.
const db = env.DB;

const insertUser = (username: string) =>
  db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, NULL) RETURNING id")
    .bind(username)
    .first<{ id: number }>();

const insertPosting = (userId: number, overrides: Partial<Record<string, unknown>> = {}) => {
  const row = {
    title: "GMMK Pro",
    description: "",
    image_url: "https://example.com/kb.jpg",
    price_cents: 19999,
    ...overrides,
  };
  return db
    .prepare(
      "INSERT INTO postings (user_id, title, description, image_url, price_cents) VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(userId, row.title, row.description, row.image_url, row.price_cents)
    .first<{ id: number }>();
};

describe("migrations", () => {
  it("create every table as STRICT", async () => {
    const { results } = await db
      .prepare(
        "SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND name IN ('users','sessions','postings','saved_listings','switches','auth_throttle') ORDER BY name",
      )
      .all<{ name: string; strict: number }>();
    expect(results).toEqual([
      { name: "auth_throttle", strict: 1 },
      { name: "postings", strict: 1 },
      { name: "saved_listings", strict: 1 },
      { name: "sessions", strict: 1 },
      { name: "switches", strict: 1 },
      { name: "users", strict: 1 },
    ]);
  });

  it("seed about 20 switches with a name, type and manufacturer", async () => {
    const { results } = await db
      .prepare("SELECT name, manufacturer, switch_type, image_url FROM switches")
      .all<{ name: string; manufacturer: string; switch_type: string; image_url: string | null }>();
    expect(results.length).toBeGreaterThanOrEqual(18);
    for (const row of results) {
      expect(row.name.trim()).not.toBe("");
      expect(row.manufacturer.trim()).not.toBe("");
      expect(["linear", "tactile", "clicky"]).toContain(row.switch_type);
      expect(row.image_url).toBeNull();
    }
  });

  it("enforce foreign keys", async () => {
    await expect(insertPosting(999_999)).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("make usernames unique case-insensitively", async () => {
    await insertUser("Alice");
    await expect(insertUser("alice")).rejects.toThrow(/UNIQUE/i);
  });

  it("reject usernames outside the allowed characters", async () => {
    for (const bad of ["ab", "has space", "émile", "-dash-first", "x".repeat(33)]) {
      await expect(insertUser(bad), bad).rejects.toThrow(/CHECK/i);
    }
  });

  it("reject bad postings", async () => {
    const user = await insertUser("poster");
    const userId = user?.id ?? 0;
    for (const bad of [
      { title: "   " },
      { image_url: "javascript:alert(1)" },
      { image_url: "http://example.com/a.jpg" },
      { price_cents: -1 },
      { price_cents: 10_000_000_000 },
      { price_cents: 1.5 },
    ]) {
      await expect(insertPosting(userId, bad), JSON.stringify(bad)).rejects.toThrow();
    }
  });

  it("cascade deletes from users to postings and saved listings", async () => {
    const seller = await insertUser("seller");
    const buyer = await insertUser("buyer");
    const posting = await insertPosting(seller?.id ?? 0);
    await db
      .prepare("INSERT INTO saved_listings (user_id, posting_id) VALUES (?, ?)")
      .bind(buyer?.id, posting?.id)
      .run();

    await db.prepare("DELETE FROM users WHERE id = ?").bind(seller?.id).run();

    const postings = await db
      .prepare("SELECT count(*) AS n FROM postings WHERE id = ?")
      .bind(posting?.id)
      .first<{ n: number }>();
    const saved = await db
      .prepare("SELECT count(*) AS n FROM saved_listings WHERE posting_id = ?")
      .bind(posting?.id)
      .first<{ n: number }>();
    expect(postings?.n).toBe(0);
    expect(saved?.n).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  ApiError,
  PostingPage,
  PublicConfig,
  SavedListing,
  SavedPostingPage,
  SwitchList,
  User,
  UserResponse,
} from "../../shared/schemas";
import { db } from "./db";
import { MOCK_PASSPHRASE } from "./fixtures";

// The mocks follow docs/api.md (backend branch). These checks pin the
// statuses and body shapes the client depends on.
const call = (method: string, path: string, body?: unknown) =>
  fetch(new URL(path, window.location.origin), {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });

describe("mock API contract", () => {
  it("GET /api/config and /api/switches", async () => {
    expect(
      PublicConfig.parse(await (await call("GET", "/api/config")).json()).turnstileSiteKey,
    ).toBe("1x00000000000000000000AA");
    const switches = SwitchList.parse(await (await call("GET", "/api/switches")).json());
    expect(switches.items.map((s) => s.name)).toEqual(
      [...switches.items.map((s) => s.name)].sort(),
    );
  });

  it("auth: register 201 {user}, duplicate 409, login 401 same body, me bare user", async () => {
    const turnstileToken = "token";
    const created = await call("POST", "/api/auth/register", {
      username: "Newbie",
      password: "fake test words",
      turnstileToken,
    });
    expect(created.status).toBe(201);
    UserResponse.parse(await created.json());
    expect(User.parse(await (await call("GET", "/api/auth/me")).json()).username).toBe("Newbie");

    const dup = await call("POST", "/api/auth/register", {
      username: "newbie",
      password: "fake test words",
      turnstileToken,
    });
    expect(dup.status).toBe(409);
    expect(ApiError.parse(await dup.json()).error.fields?.username).toBeDefined();

    const wrongUser = await call("POST", "/api/auth/login", {
      username: "nobody-here",
      password: "x",
      turnstileToken,
    });
    const wrongPass = await call("POST", "/api/auth/login", {
      username: "kash",
      password: "x",
      turnstileToken,
    });
    expect([wrongUser.status, wrongPass.status]).toEqual([401, 401]);
    expect(await wrongUser.json()).toEqual(await wrongPass.json());

    const ok = await call("POST", "/api/auth/login", {
      username: "kash",
      password: MOCK_PASSPHRASE,
      turnstileToken,
    });
    expect(ok.status).toBe(200);
    expect((await call("POST", "/api/auth/logout")).status).toBe(204);
    expect((await call("GET", "/api/auth/me")).status).toBe(401);
  });

  it("paging: {items, nextCursor}, bad cursor 400", async () => {
    const first = PostingPage.parse(await (await call("GET", "/api/postings?limit=20")).json());
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = PostingPage.parse(
      await (await call("GET", `/api/postings?limit=20&cursor=${first.nextCursor}`)).json(),
    );
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect((await call("GET", "/api/postings?cursor=!!")).status).toBe(400);
    expect((await call("GET", "/api/postings/abc")).status).toBe(400);
  });

  it("saved: PUT 201 then 200 with SavedListing, DELETE 204 then 404, list has savedAt", async () => {
    db.state.sessionUserId = 1;
    const put = await call("PUT", "/api/me/saved/7");
    expect(put.status).toBe(201);
    SavedListing.parse(await put.json());
    expect((await call("PUT", "/api/me/saved/7")).status).toBe(200);
    const page = SavedPostingPage.parse(await (await call("GET", "/api/me/saved")).json());
    expect(page.items[0]?.id).toBe(7);
    expect((await call("DELETE", "/api/me/saved/7")).status).toBe(204);
    expect((await call("DELETE", "/api/me/saved/7")).status).toBe(404);
    expect((await call("PUT", "/api/me/saved/9999")).status).toBe(404);
  });

  it("owner-only writes are 404 for others; JSON only", async () => {
    db.state.sessionUserId = 1;
    const body = { title: "x", imageUrl: "https://img.keebhub.test/x.svg", priceCents: 1 };
    expect((await call("PUT", "/api/postings/2", body)).status).toBe(404);
    expect((await call("DELETE", "/api/postings/2")).status).toBe(404);
    const text = await fetch(new URL("/api/postings", window.location.origin), {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hi",
    });
    expect(text.status).toBe(415);
  });

  it("wrong current password is 400 with fields, not 401", async () => {
    db.state.sessionUserId = 1;
    const res = await call("POST", "/api/auth/password", {
      currentPassword: "nope",
      newPassword: "fake new words",
    });
    expect(res.status).toBe(400);
    expect(ApiError.parse(await res.json()).error.fields?.currentPassword).toBeDefined();
    const del = await call("DELETE", "/api/me", { password: "nope" });
    expect(del.status).toBe(400);
    expect(ApiError.parse(await del.json()).error.fields?.password).toBeDefined();
  });

  it("POST /api/postings: 429 listing_limit after 20 in an hour (Retry-After), and at 50 active", async () => {
    db.state.sessionUserId = 2;
    const body = { title: "x", imageUrl: "https://img.keebhub.test/x.svg", priceCents: 1 };
    for (let n = 0; n < 20; n += 1) {
      expect((await call("POST", "/api/postings", body)).status).toBe(201);
    }
    const hourly = await call("POST", "/api/postings", body);
    expect(hourly.status).toBe(429);
    expect(Number(hourly.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(ApiError.parse(await hourly.json()).error.code).toBe("listing_limit");

    // A new hour, but top bench up to 50 active listings.
    db.state.postingsCreated = [];
    let active = db.state.postings.filter((p) => p.userId === 2).length;
    for (; active < 50; active += 1) {
      expect((await call("POST", "/api/postings", body)).status).toBe(201);
    }
    db.state.postingsCreated = [];
    const capped = await call("POST", "/api/postings", body);
    expect(capped.status).toBe(429);
    expect(capped.headers.get("retry-after")).toBeNull();
    expect(ApiError.parse(await capped.json()).error.code).toBe("listing_limit");
  });
});

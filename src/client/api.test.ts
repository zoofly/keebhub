import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError, getMe, getSwitches, savePosting, unsavePosting } from "./api";
import { db } from "./mocks/db";
import { server } from "./mocks/node";
import { createQueryClient } from "./queryClient";

describe("api module", () => {
  it("returns null from getMe on 401 and the bare user on 200", async () => {
    expect(await getMe()).toBeNull();
    db.state.sessionUserId = 2;
    expect(await getMe()).toEqual({ id: 2, username: "bench" });
  });

  it("turns error bodies into ApiRequestError with fields and Retry-After", async () => {
    server.use(
      http.get("/api/switches", () =>
        HttpResponse.json(
          { error: { code: "rate_limited", message: "Slow down" } },
          { status: 429, headers: { "Retry-After": "120" } },
        ),
      ),
    );
    const error = await getSwitches().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 429, code: "rate_limited", retryAfterSeconds: 120 });
  });

  it("reports unreachable servers as status 0", async () => {
    server.use(http.get("/api/switches", () => HttpResponse.error()));
    await expect(getSwitches()).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("rejects responses that don't match the shared schema", async () => {
    server.use(http.get("/api/switches", () => HttpResponse.json([{ name: "bare array" }])));
    await expect(getSwitches()).rejects.toMatchObject({ code: "bad_response" });
  });

  it("saves idempotently and treats unsaving something unsaved as done", async () => {
    db.state.sessionUserId = 1;
    expect(await savePosting(5)).toMatchObject({ postingId: 5 });
    expect(await savePosting(5)).toMatchObject({ postingId: 5 }); // 200 the second time
    await unsavePosting(5);
    await expect(unsavePosting(5)).resolves.toBeUndefined(); // 404 -> fine
  });

  it("sends bodyless writes without a Content-Type", async () => {
    db.state.sessionUserId = 1;
    let contentType: string | null = "unset";
    server.use(
      http.put("/api/me/saved/:id", ({ request }) => {
        contentType = request.headers.get("content-type");
        return HttpResponse.json(
          { postingId: 3, savedAt: "2026-10-20T00:00:00.000Z" },
          { status: 201 },
        );
      }),
    );
    await savePosting(3);
    expect(contentType).toBeNull();
  });
});

describe("query client", () => {
  it("calls onUnauthorized for a 401 unless the query opts out", async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient(onUnauthorized);
    const fail = () => Promise.reject(new ApiRequestError(401, "unauthorized", "no"));
    await client.fetchQuery({ queryKey: ["a"], queryFn: fail }).catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await client
      .fetchQuery({ queryKey: ["b"], queryFn: fail, meta: { skipAuthRedirect: true } })
      .catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry client errors", async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(() => Promise.reject(new ApiRequestError(404, "not_found", "no")));
    await client
      .fetchQuery({
        queryKey: ["c"],
        queryFn,
        retry: client.getDefaultOptions().queries?.retry ?? false,
      })
      .catch(() => {});
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});

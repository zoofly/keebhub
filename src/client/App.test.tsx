import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows the API as ok when /api/health answers ok", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("API: ok")).toBeDefined();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/health");
  });

  it("shows the API as unavailable on a 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "unavailable", message: "Database unavailable" } },
          { status: 503 },
        ),
      ),
    );

    render(<App />);

    expect(await screen.findByText("API: unavailable")).toBeDefined();
  });
});

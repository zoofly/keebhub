import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { toastStore } from "../lib/toast";
import { db } from "../mocks/db";
import { server } from "../mocks/node";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  db.reset();
  toastStore.clear();
  delete window.turnstile;
  document.title = "";
});

afterAll(() => server.close());

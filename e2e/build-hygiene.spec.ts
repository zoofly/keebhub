import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// The build that e2e/server.ts made (and the suite runs against) is a
// production build: no MSW, no mocks, no source maps.

const dist = path.resolve(import.meta.dirname, "..", "dist");

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });

test("dist has no mockServiceWorker.js and no source maps", () => {
  const files = filesUnder(dist).map((file) => path.relative(dist, file));
  expect(files.some((file) => file.startsWith("client/"))).toBe(true);
  expect(files.filter((file) => path.basename(file) === "mockServiceWorker.js")).toEqual([]);
  expect(files.filter((file) => file.endsWith(".map"))).toEqual([]);
});

test("no MSW or mock code in the client bundle or the Worker", () => {
  const scripts = filesUnder(dist).filter((file) => /\.(m?js)$/.test(file));
  expect(scripts.length).toBeGreaterThan(1);
  for (const file of scripts) {
    const source = readFileSync(file, "utf8");
    for (const marker of [
      /mockServiceWorker/,
      /\bmsw\b/i,
      /API mocked with MSW/,
      /mock-only/,
      /sourceMappingURL/,
    ]) {
      expect(marker.test(source), `${path.relative(dist, file)} matches ${marker}`).toBe(false);
    }
  }
});

test("no client chunk is over 500 kB", () => {
  const chunks = filesUnder(path.join(dist, "client", "assets")).filter((file) =>
    file.endsWith(".js"),
  );
  for (const chunk of chunks) {
    expect(readFileSync(chunk).byteLength, path.basename(chunk)).toBeLessThan(500 * 1024);
  }
});

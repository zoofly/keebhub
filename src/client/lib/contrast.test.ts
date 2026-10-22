/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest stubs CSS imports, so read the stylesheet from disk.
const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");

// Checks the text/background pairs the UI uses against WCAG AA, reading the
// real token values from styles.css so the test can't drift from the theme.
const token = (name: string) => {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css);
  if (!match?.[1]) {
    throw new Error(`token ${name} not found`);
  }
  return match[1];
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("theme contrast (WCAG AA)", () => {
  it.each([
    ["ink", "page"],
    ["ink", "surface"],
    ["muted", "page"],
    ["muted", "surface"],
    ["muted", "primary-soft"],
    ["primary", "surface"],
    ["primary", "page"],
    ["primary", "primary-soft"],
    ["primary-dark", "primary-soft"],
    ["danger", "surface"],
    ["danger", "danger-soft"],
    ["surface", "primary"],
    ["surface", "primary-dark"],
    ["surface", "danger"],
  ])("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("focus rings and input borders reach 3:1 (non-text contrast)", () => {
    expect(contrast(token("focus"), token("page"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("accent"), token("primary-dark"))).toBeGreaterThanOrEqual(3);
    expect(contrast("#8a80a0", token("surface"))).toBeGreaterThanOrEqual(3);
  });
});

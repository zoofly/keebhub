import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, test as base, expect, type Page } from "@playwright/test";

// Shared Playwright fixtures. The app is a `vite build --mode e2e` build: the
// SPA's /api/* calls are answered by the MSW mocks in src/client/mocks, which
// keep their data in sessionStorage, so every test (new context) starts from
// the same seed.

/** Seeded mock accounts (see src/client/mocks/fixtures.ts). Not real credentials. */
export const MOCK_PASSPHRASE = "mock-only-passphrase";
export const KASH = { id: 1, username: "kash" };

/**
 * Turnstile stand-in served for challenges.cloudflare.com, so tests don't
 * depend on Cloudflare. It renders a visible "passed" box and hands out a
 * token, like the always-pass test key does. (turnstile-real.spec.ts uses the
 * real widget.)
 */
const TURNSTILE_STUB = `
(() => {
  const widgets = new Map();
  let n = 0;
  const issue = (id) => {
    const w = widgets.get(id);
    if (w) setTimeout(() => w.callback(window.__e2eTurnstileToken || "e2e-turnstile-token"), 0);
  };
  window.turnstile = {
    render(el, options) {
      const id = "w" + (++n);
      const box = document.createElement("p");
      box.textContent = "Security check passed (test stub)";
      box.dataset.testid = "turnstile-stub";
      el.appendChild(box);
      widgets.set(id, options);
      issue(id);
      return id;
    },
    reset(id) { issue(id); },
    remove(id) { widgets.delete(id); },
  };
})();
`;

const svgFor = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#8d6eb8"/>
  <rect x="60" y="90" width="280" height="120" rx="18" fill="#ece6f6"/>
  <text x="200" y="160" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#432c6b">${label}</text>
</svg>`;

/** Routes for a test context: Turnstile stub and the mock image hosts. */
export async function prepareContext(context: BrowserContext) {
  await context.route("https://challenges.cloudflare.com/turnstile/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB }),
  );
  await context.route("https://img.keebhub.test/**", (route) => {
    const name = new URL(route.request().url()).pathname.replace(/\W+/g, " ").trim();
    return route.fulfill({ contentType: "image/svg+xml", body: svgFor(name.slice(0, 24)) });
  });
  await context.route("https://broken.keebhub.test/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
}

type Issue = { kind: "csp" | "pageerror" | "console"; text: string };

/** Watches the console: any CSP report, uncaught error or unexpected console.error fails the test. */
export function watchConsole(page: Page) {
  const issues: Issue[] = [];
  page.on("pageerror", (error) => issues.push({ kind: "pageerror", text: error.message }));
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|Content-Security-Policy|\[Report Only\]/i.test(text)) {
      issues.push({ kind: "csp", text });
    } else if (message.type() === "error" && !text.startsWith("Failed to load resource")) {
      // "Failed to load resource" is Chrome noting an expected 4xx (e.g. 401
      // from /api/auth/me for guests) or a deliberately broken test image.
      issues.push({ kind: "console", text });
    }
  });
  return issues;
}

export type Fixtures = {
  /** Console problems collected during the test (asserted empty afterwards). */
  consoleIssues: Issue[];
};

export const test = base.extend<Fixtures>({
  context: async ({ context }, use) => {
    await prepareContext(context);
    await use(context);
  },
  consoleIssues: [
    async ({ page }, use) => {
      const issues = watchConsole(page);
      await use(issues);
      expect(issues, "console errors / CSP reports").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Loads the app and waits until the mocks and the first render are ready. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__keebhubMocks));
}

/** Signs in through the (mocked) API and reloads, like an existing session. */
export async function signIn(page: Page, username = KASH.username, path = "/") {
  await open(page, path);
  const status = await page.evaluate(
    async ([name, password]) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: name, password, turnstileToken: "e2e" }),
      });
      return res.status;
    },
    [username, MOCK_PASSPHRASE] as const,
  );
  expect(status).toBe(200);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__keebhubMocks));
}

/** The phone layout hides the nav behind a Menu button. */
export async function openMenuIfNeeded(page: Page) {
  const toggle = page.getByRole("button", { name: "Menu" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
}

export const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

/** No horizontal scrolling at the current viewport width. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "horizontal scroll").toBeLessThanOrEqual(clientWidth);
}

export type AxeSummary = { serious: number; critical: number; moderate: number; minor: number };

/**
 * Runs axe (WCAG 2.0/2.1/2.2 A and AA rules) and fails on any serious or
 * critical violation. Returns the counts for reporting.
 */
export async function expectAccessible(page: Page): Promise<AxeSummary> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary: AxeSummary = { serious: 0, critical: 0, moderate: 0, minor: 0 };
  for (const violation of results.violations) {
    if (violation.impact) {
      summary[violation.impact] += violation.nodes.length;
    }
  }
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`,
    );
  expect(blocking, "serious/critical axe violations").toEqual([]);
  return summary;
}

declare global {
  interface Window {
    __keebhubMocks?: {
      reset: () => void;
      expireSession: () => void;
      failNext: (method: string, path: string, times?: number) => void;
    };
    __e2eTurnstileToken?: string;
    turnstile?: unknown;
  }
}

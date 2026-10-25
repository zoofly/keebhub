import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, test as base, expect, type Page } from "@playwright/test";
import { randomIp, SEED_PASSPHRASE, TURNSTILE_DUMMY_TOKEN, uniqueName } from "./support";

// Shared Playwright fixtures. The app is the production build served by
// `vite preview` (e2e/server.ts): the real Worker in workerd with a fresh
// local D1, seeded by global-setup.ts. Tests run one at a time against that
// shared database, so a test that changes seeded data puts it back, and
// anything else uses its own account (newUser) or its own listings.

export { SEED_PASSPHRASE } from "./support";
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
    if (w) setTimeout(() => w.callback(window.__e2eTurnstileToken || "${TURNSTILE_DUMMY_TOKEN}"), 0);
  };
  window.turnstile = {
    render(el, options) {
      const id = "w" + (++n);
      const box = document.createElement("p");
      box.textContent = "Security check passed (test stub)";
      box.dataset.testid = "turnstile-stub";
      // Sized like the real widget: "flexible" is never narrower than 300px,
      // "compact" is 150px, so layouts that are too narrow scroll sideways
      // here too (e2e/shell.spec.ts checks).
      box.dataset.size = options.size || "normal";
      // Echo the action the app asked for, so specs can check it.
      box.dataset.action = options.action || "";
      if (options.size === "compact") box.style.width = "150px";
      else if (options.size === "flexible") { box.style.width = "100%"; box.style.minWidth = "300px"; }
      else box.style.width = "300px";
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

/**
 * Sets up a test context: its own client IP (so per-IP auth limits stay per
 * test), the Turnstile stub, the test image hosts, and a listener that turns
 * any CSP violation into a console error (which fails the test).
 */
export async function prepareContext(context: BrowserContext) {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": randomIp() });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(
        `CSP violation: ${event.violatedDirective} blocked ${event.blockedURI || "inline"}`,
      );
    });
  });
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

/**
 * Flake hunting: E2E_CPU_THROTTLE=<rate> slows every page's CPU by that
 * factor (Chrome DevTools CPU throttling), which widens race windows between
 * a URL change and React committing the new route. Off by default.
 */
export async function throttleCpu(page: Page) {
  const rate = Number(process.env.E2E_CPU_THROTTLE ?? "0");
  if (rate > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  }
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
  page: async ({ page }, use) => {
    await throttleCpu(page);
    await use(page);
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

/** Loads the app and waits for the first render. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
}

const apiHeaders = (page: Page) => ({ origin: new URL(page.url()).origin });

/** Signs in through the API (the context keeps the cookie), then opens `path`. */
export async function signIn(
  page: Page,
  username: string = KASH.username,
  path = "/",
  password = SEED_PASSPHRASE,
) {
  await open(page, path);
  const res = await page.request.post("/api/auth/login", {
    headers: apiHeaders(page),
    data: { username, password, turnstileToken: TURNSTILE_DUMMY_TOKEN },
  });
  expect(res.status(), await res.text()).toBe(200);
  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
}

/** Registers a fresh account (signed in in this context) and opens `path`. */
export async function newUser(page: Page, prefix = "e2e", path = "/") {
  await open(page, path);
  const username = uniqueName(prefix);
  const res = await page.request.post("/api/auth/register", {
    headers: apiHeaders(page),
    data: { username, password: SEED_PASSPHRASE, turnstileToken: TURNSTILE_DUMMY_TOKEN },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { user } = (await res.json()) as { user: { id: number; username: string } };
  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  return user;
}

/** Creates a listing as the signed-in user through the API. */
export async function createListing(
  page: Page,
  posting: { title: string; priceCents?: number; description?: string; imageUrl?: string },
) {
  const res = await page.request.post("/api/postings", {
    headers: apiHeaders(page),
    data: {
      description: "",
      priceCents: 1000,
      imageUrl: "https://img.keebhub.test/e2e.svg",
      ...posting,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: number; title: string };
}

/** Ends the session as if it expired: the browser loses its cookie. */
export async function expireSession(page: Page) {
  await page.context().clearCookies();
}

/**
 * Makes the next `times` requests to `method path` fail with a 500, to
 * exercise error states (the real API has no switch for that).
 */
export async function failNext(page: Page, method: string, path: string, times = 1) {
  let remaining = times;
  await page.route(
    (url) => url.pathname === path,
    (route) => {
      if (route.request().method() === method.toUpperCase() && remaining > 0) {
        remaining -= 1;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "internal", message: "Internal server error" } }),
        });
      }
      return route.fallback();
    },
  );
}

/**
 * The phone layout hides the nav behind a Menu button. Opens it and waits
 * for it to be open, not just for the click.
 *
 * Call it only once the page you navigated to has rendered (wait for its
 * heading first): the nav closes the menu in an effect after each route
 * change, and that effect runs after React commits the new route, which can
 * be well after the URL has changed. Opening the menu in that gap lets the
 * late effect close it again (the "Log in link not visible" flake).
 */
export async function openMenuIfNeeded(page: Page) {
  const toggle = page.getByRole("button", { name: "Menu" });
  if (!(await toggle.isVisible())) {
    return; // desktop: the nav is always shown
  }
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

/**
 * Logs out with the nav's button and waits until the home page has rendered
 * and, on phones, the menu has closed itself after that route change, so the
 * next openMenuIfNeeded can't race it.
 */
export async function logOutInUi(page: Page) {
  const from = new URL(page.url()).pathname;
  await openMenuIfNeeded(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Log out" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Keebhub" })).toBeVisible();
  // The menu only closes itself when the path changes (not when logging out from "/").
  const toggle = page.getByRole("button", { name: "Menu" });
  if (from !== "/" && (await toggle.isVisible())) {
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
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
    __e2eTurnstileToken?: string;
    turnstile?: unknown;
  }
}

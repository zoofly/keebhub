// Web server for the Playwright suite (playwright.config.ts `webServer`):
// the production build served by `vite preview`, i.e. the real Worker in
// workerd with a fresh local D1. Run with `node e2e/server.ts`.
//
// 1. Wipes .wrangler/e2e (this suite's own local state; dev data in
//    .wrangler/state is untouched).
// 2. `vite build` (production mode: no MSW, no source maps).
// 3. Writes dist/keebhub/.dev.vars, which `vite preview` reads: a random
//    pepper for this run and Cloudflare's documented always-pass Turnstile
//    TEST keys. Generated every run, never committed; a developer's own
//    .dev.vars is not touched.
// 4. Applies the D1 migrations to the fresh state, then starts the preview.
//
// Register and login call Turnstile siteverify and the HIBP range API from
// the Worker, so the suite needs network access.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = process.env.E2E_PORT ?? "4173";
const state = path.join(root, ".wrangler", "e2e");

// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
// Public dummy keys: the site key always passes, and the secret key accepts
// only the dummy token XXXX.DUMMY.TOKEN.XXXX. Not credentials.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
// Built from its parts ("1x", 31 zeros, "AA") so secret scanners don't
// mistake the documented dummy for a real key.
const TURNSTILE_TEST_SECRET_KEY = `1x${"0".repeat(31)}AA`;

const run = (command: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const secrets = {
  PASSWORD_PEPPER_V1: randomBytes(32).toString("base64"),
  TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
  TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET_KEY,
};

rmSync(state, { recursive: true, force: true });
// The build also reads these (instead of a developer's own .dev.vars only
// when there is none), so it doesn't warn about missing secrets.
run("npx", ["vite", "build"], secrets);

writeFileSync(
  path.join(root, "dist", "keebhub", ".dev.vars"),
  `${Object.entries(secrets)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`,
  { mode: 0o600 },
);

run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", state]);

const preview = spawn("npx", ["vite", "preview", "--port", port, "--strictPort"], {
  cwd: root,
  // The Worker's request and auth-event logs are noise in test output; set
  // E2E_VERBOSE=1 to see them. Errors (stderr) always show.
  stdio: ["ignore", process.env.E2E_VERBOSE ? "inherit" : "ignore", "inherit"],
  env: { ...process.env, KEEBHUB_LOCAL_STATE: state },
});
const stop = () => preview.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
preview.on("exit", (code) => process.exit(code ?? 0));

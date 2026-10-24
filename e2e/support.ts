// Values shared by the e2e fixtures and global setup.

/**
 * Password of the seeded e2e accounts (see global-setup.ts). They exist only
 * in the throwaway local D1 that e2e/server.ts creates for each run.
 */
export const SEED_PASSPHRASE = "mock-only-passphrase";

/**
 * Cloudflare's documented Turnstile dummy token: the only token the
 * always-pass test secret key accepts. Public, not a credential.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/**
 * A random documentation-range client IP. Each test context sends its own
 * (as cf-connecting-ip, which the local runtime passes through), so the
 * per-IP auth limits of one test never affect another.
 */
export const randomIp = () =>
  `198.18.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

/** A username unique to this run, e.g. for registering in a test. */
export const uniqueName = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.slice(
    0,
    32,
  );

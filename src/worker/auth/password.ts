// Password hashing: PBKDF2-HMAC-SHA256 with a secret pepper (plan §4).
//
//   input  = HMAC-SHA256(key = pepper, msg = NFC(password))
//   hash   = PBKDF2-SHA256(input, salt[16], PBKDF2_ITERATIONS) -> 32 bytes
//   stored = $pbkdf2-sha256$v=1$i=<iterations>$p=<pepper version>$<salt b64>$<hash b64>
//
// Each stored hash records its iteration count and pepper version, so either
// can change later: verifyPassword reports `needsRehash` and the login
// handler re-hashes with the current settings.
//
// Tuning: workerd caps PBKDF2 at 100,000 iterations, and the Free plan allows
// about 10 ms of CPU per request. If production login cpuTime is too high,
// lower PBKDF2_ITERATIONS (e.g. 50_000); existing hashes keep working and are
// upgraded or downgraded on the next successful login.

import { bytesEqual, randomBytes } from "../lib/crypto";
import { fromBase64, toBase64, utf8 } from "../lib/encoding";

export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const FORMAT_VERSION = 1;

/**
 * Pepper keys by version. To rotate: add PASSWORD_PEPPER_V2 as a secret (and
 * to `secrets.required`), add it here, and set `current: 2`. Old hashes
 * keep verifying with V1 and are re-hashed with V2 on the next login; drop
 * V1 once no hash uses it.
 */
export interface Peppers {
  current: number;
  keys: Readonly<Record<number, string | undefined>>;
}

export function peppersFromEnv(env: Pick<Env, "PASSWORD_PEPPER_V1">): Peppers {
  return { current: 1, keys: { 1: env.PASSWORD_PEPPER_V1 } };
}

export class PepperMissingError extends Error {
  constructor(version: number) {
    super(`PASSWORD_PEPPER_V${version} is not configured`);
    this.name = "PepperMissingError";
  }
}

function pepperKey(peppers: Peppers, version: number): string {
  const key = peppers.keys[version];
  if (!key) {
    throw new PepperMissingError(version);
  }
  return key;
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  pepper: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    utf8(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const peppered = await crypto.subtle.sign("HMAC", hmacKey, utf8(password.normalize("NFC")));
  const baseKey = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

interface ParsedHash {
  iterations: number;
  pepperVersion: number;
  salt: Uint8Array<ArrayBuffer>;
  hash: Uint8Array<ArrayBuffer>;
}

const PHC_PATTERN =
  /^\$pbkdf2-sha256\$v=(\d+)\$i=(\d{1,7})\$p=(\d{1,4})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export function parsePasswordHash(stored: string): ParsedHash | null {
  const match = PHC_PATTERN.exec(stored);
  if (!match || Number(match[1]) !== FORMAT_VERSION) {
    return null;
  }
  const iterations = Number(match[2]);
  if (iterations < 1 || iterations > 100_000) {
    return null;
  }
  try {
    const salt = fromBase64(match[4] ?? "");
    const hash = fromBase64(match[5] ?? "");
    if (salt.byteLength !== SALT_BYTES || hash.byteLength !== HASH_BYTES) {
      return null;
    }
    return { iterations, pepperVersion: Number(match[3]), salt, hash };
  } catch {
    return null;
  }
}

export function formatPasswordHash(parsed: ParsedHash): string {
  return [
    "",
    "pbkdf2-sha256",
    `v=${FORMAT_VERSION}`,
    `i=${parsed.iterations}`,
    `p=${parsed.pepperVersion}`,
    toBase64(parsed.salt),
    toBase64(parsed.hash),
  ].join("$");
}

/** Hashes a new password with the current iteration count and pepper. */
export async function hashPassword(
  password: string,
  peppers: Peppers,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, iterations, pepperKey(peppers, peppers.current));
  return formatPasswordHash({ iterations, pepperVersion: peppers.current, salt, hash });
}

export interface VerifyResult {
  valid: boolean;
  /** True when the hash should be replaced with one using current settings. */
  needsRehash: boolean;
}

// A fixed salt for the dummy derivation run for unknown usernames.
const DUMMY_SALT = new Uint8Array(SALT_BYTES);

/**
 * Verifies a password against a stored hash. With no stored hash (unknown
 * user, or a passkey-only account) it still runs one full derivation, so the
 * response time does not reveal whether the username exists.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
  peppers: Peppers,
): Promise<VerifyResult> {
  const parsed = stored ? parsePasswordHash(stored) : null;
  if (!parsed) {
    await derive(password, DUMMY_SALT, PBKDF2_ITERATIONS, pepperKey(peppers, peppers.current));
    return { valid: false, needsRehash: false };
  }
  const candidate = await derive(
    password,
    parsed.salt,
    parsed.iterations,
    pepperKey(peppers, parsed.pepperVersion),
  );
  const valid = bytesEqual(candidate, parsed.hash);
  return {
    valid,
    needsRehash:
      valid &&
      (parsed.iterations !== PBKDF2_ITERATIONS || parsed.pepperVersion !== peppers.current),
  };
}

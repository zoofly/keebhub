import { toBase32, toHex, utf8 } from "./encoding";

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** 15 random bytes = 120 bits, as 24 lower-case base32 characters. */
export const randomId120 = (): string => toBase32(randomBytes(15));

export async function sha256(
  data: Uint8Array<ArrayBuffer> | string,
): Promise<Uint8Array<ArrayBuffer>> {
  const input = typeof data === "string" ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

export async function sha1Hex(data: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-1", utf8(data))));
}

/**
 * Constant-time comparison of two byte strings of the same length.
 * Different lengths return false (callers only compare fixed-size digests).
 */
export function bytesEqual(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return crypto.subtle.timingSafeEqual(a, b);
}

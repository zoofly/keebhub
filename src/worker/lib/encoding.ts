const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (value: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(encoder.encode(value));

/** Standard base64 without padding (the PHC string encoding). */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=+$/, "");
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** base64url without padding, for opaque cursors. */
export const toBase64Url = (value: string): string =>
  toBase64(utf8(value)).replace(/\+/g, "-").replace(/\//g, "_");

/** Returns null if the value is not valid base64url. */
export function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    return decoder.decode(fromBase64(padded));
  } catch {
    return null;
  }
}

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Lower-case base32 (RFC 4648 alphabet, no padding). */
export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

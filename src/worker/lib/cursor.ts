// Opaque keyset cursors (base64url). Clients pass them back unchanged.
import { fromBase64Url, toBase64Url } from "./encoding";

const POSITIVE_INT = /^[1-9]\d{0,15}$/;

export const encodeIdCursor = (id: number): string => toBase64Url(`p${id}`);

/** null for a cursor this API didn't issue. */
export function decodeIdCursor(cursor: string): number | null {
  const raw = fromBase64Url(cursor);
  if (!raw?.startsWith("p") || !POSITIVE_INT.test(raw.slice(1))) {
    return null;
  }
  return Number(raw.slice(1));
}

export const encodeSavedCursor = (savedAt: number, postingId: number): string =>
  toBase64Url(`s${savedAt}_${postingId}`);

export function decodeSavedCursor(cursor: string): { savedAt: number; postingId: number } | null {
  const raw = fromBase64Url(cursor);
  const match = raw ? /^s(\d{1,12})_([1-9]\d{0,15})$/.exec(raw) : null;
  if (!match) {
    return null;
  }
  return { savedAt: Number(match[1]), postingId: Number(match[2]) };
}

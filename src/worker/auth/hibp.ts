// Have I Been Pwned "Pwned Passwords" check (ASVS V2.1.7), using the
// k-anonymity range API: only the first 5 hex characters of the password's
// SHA-1 leave the Worker. Fails open: if the API is unreachable, the
// password is allowed.

import { sha1Hex } from "../lib/crypto";

export const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

/** True if the password appears in a known breach. */
export async function isPwnedPassword(password: string): Promise<boolean> {
  const digest = (await sha1Hex(password.normalize("NFC"))).toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const res = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      // Padding hides the real number of matches from anyone watching.
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn(JSON.stringify({ message: "hibp range lookup failed", status: res.status }));
      return false;
    }
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [candidate, count] = line.trim().split(":");
      // Padding entries have a count of 0.
      if (candidate === suffix && Number(count) > 0) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn(
      JSON.stringify({
        message: "hibp unreachable; allowing password",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return false;
  }
}

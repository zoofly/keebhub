// Structured auth event logs (plan §4, A09). Usernames are logged only as a
// truncated SHA-256 of the normalized name; passwords, tokens and cookies
// are never logged.
import { normalizeUsername } from "../../shared/schemas";
import { sha256 } from "../lib/crypto";
import { toHex } from "../lib/encoding";

export type AuthEvent =
  | "auth.register"
  | "auth.login"
  | "auth.login_failed"
  | "auth.locked"
  | "auth.turnstile_failed"
  | "auth.logout"
  | "auth.password_changed"
  | "auth.password_change_failed"
  | "auth.account_deleted"
  | "auth.account_delete_failed";

export async function usernameHash(username: string): Promise<string> {
  return toHex(await sha256(normalizeUsername(username))).slice(0, 16);
}

export async function logAuthEvent(
  event: AuthEvent,
  details: { username?: string; userId?: number; ip: string | null; cfRay?: string | null },
): Promise<void> {
  const entry = {
    event,
    userId: details.userId ?? null,
    usernameHash: details.username ? await usernameHash(details.username) : null,
    ip: details.ip,
    cfRay: details.cfRay ?? null,
  };
  if (event === "auth.locked" || event.endsWith("_failed")) {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

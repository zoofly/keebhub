// Server-side Turnstile verification (plan §4). Runs before any D1 write on
// register and login, so bots can't spend the daily write quota.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
}

/** The widget's `data-action` for each form. */
export type TurnstileAction = "register" | "login";

export interface TurnstileExpectation {
  /** The hostname the request came to (the page the widget ran on). */
  hostname: string;
  action: TurnstileAction;
}

/**
 * Cloudflare's test keys answer for any site (hostname "example.com", no
 * action). Their results are accepted only on these local hosts, so a test
 * secret configured by mistake in production lets nobody in.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * True only when Cloudflare confirms the token *for this site and this
 * form*: success, the hostname the widget ran on matches the request's,
 * and the action matches (a token solved on the login form can't be used
 * to register). Fails closed: a missing secret, a network error or an
 * unexpected reply all count as a failure.
 */
export async function verifyTurnstile(
  env: Pick<Env, "TURNSTILE_SECRET_KEY">,
  token: string,
  remoteIp: string | null,
  expected: TurnstileExpectation,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error(JSON.stringify({ message: "TURNSTILE_SECRET_KEY is not configured" }));
    return false;
  }
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (remoteIp) {
    form.append("remoteip", remoteIp);
  }
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ message: "turnstile siteverify failed", status: res.status }));
      return false;
    }
    const body = (await res.json()) as SiteverifyResponse;
    return checkSiteverify(body, expected);
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "turnstile siteverify unreachable",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return false;
  }
}

/** Applies the success, hostname and action rules to a siteverify reply. */
export function checkSiteverify(body: SiteverifyResponse, expected: TurnstileExpectation): boolean {
  if (body?.success !== true) {
    return false;
  }
  const host = expected.hostname.toLowerCase();
  if (body.metadata?.result_with_testing_key === true) {
    if (!LOCAL_HOSTS.has(host)) {
      console.error(
        JSON.stringify({
          message: "turnstile test-key result refused outside local development",
          host,
        }),
      );
      return false;
    }
    return true;
  }
  if (typeof body.hostname !== "string" || body.hostname.toLowerCase() !== host) {
    console.warn(
      JSON.stringify({
        message: "turnstile hostname mismatch",
        expected: host,
        got: body.hostname ?? null,
      }),
    );
    return false;
  }
  if (body.action !== expected.action) {
    console.warn(
      JSON.stringify({
        message: "turnstile action mismatch",
        expected: expected.action,
        got: body.action ?? null,
      }),
    );
    return false;
  }
  return true;
}

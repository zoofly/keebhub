// Server-side Turnstile verification (plan §4). Runs before any D1 write on
// register and login, so bots can't spend the daily write quota.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

/**
 * True only when Cloudflare confirms the token. Fails closed: a missing
 * secret, a network error or an unexpected reply all count as a failure.
 */
export async function verifyTurnstile(
  env: Pick<Env, "TURNSTILE_SECRET_KEY">,
  token: string,
  remoteIp: string | null,
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
    return body.success === true;
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

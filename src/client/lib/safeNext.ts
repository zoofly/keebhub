const PLACEHOLDER_ORIGIN = "https://keebhub.invalid";
const AUTH_PAGES = new Set(["/login", "/register"]);

/**
 * Validates a `?next=` value before redirecting to it after login, so the
 * login page can't be used as an open redirect. Only same-origin relative
 * paths ("/market?x=1") pass; "//evil.com", "https://evil.com",
 * "/\\evil.com", "javascript:..." and anything with control characters or
 * backslashes return null. Auth pages are rejected to avoid loops.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048) {
    return null;
  }
  // Must be a path, not a scheme or protocol-relative URL. Browsers treat
  // "\" like "/", so "/\evil.com" would be protocol-relative too.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || AUTH_PAGES.has(url.pathname)) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** "/login?next=<current path>" for sending a guest to log in and back. */
export function loginPathFor(next: string): string {
  const safe = safeNextPath(next);
  return safe && safe !== "/" ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

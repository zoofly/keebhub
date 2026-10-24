// Build-time client configuration. Runtime settings (the Turnstile site key)
// come from GET /api/config instead, so one build works in every environment.

/** Serve /api/* from MSW mocks. Only true in `npm run dev:mock`. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

/** Page size for the listing grids (the API clamps to 1-100). */
export const LISTINGS_PAGE_SIZE = 12;

/** False for an empty key or the "REPLACE_..." placeholder in wrangler.jsonc. */
export function isTurnstileKeyUsable(siteKey: string): boolean {
  return siteKey.trim() !== "" && !siteKey.startsWith("REPLACE_");
}

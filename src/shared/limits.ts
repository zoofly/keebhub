// Limits shared by the API, the forms and migrations/0001_init.sql.
// Changing one here means changing the matching CHECK constraint (in a new
// migration) and getting sign-off from both the frontend and backend tracks.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
/** Letters, digits, ".", "_" and "-", starting with a letter or digit. */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Counted in Unicode code points after NFC normalization. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const IMAGE_URL_MAX = 2048;

/** 99,999,999.99 */
export const PRICE_MAX_CENTS = 9_999_999_999;

/** Largest id accepted in a URL (matches the legacy API's 32-bit ids). */
export const ID_MAX = 2_147_483_647;

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
export const CURSOR_MAX = 200;

/** Request bodies larger than this are rejected with 413. */
export const BODY_LIMIT_BYTES = 100 * 1024;

export const TURNSTILE_TOKEN_MAX = 2048;

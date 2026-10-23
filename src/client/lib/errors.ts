// Turns API errors into messages for people, ported from
// the legacy app's apiErrors.js and errors.reducer.js. Never includes
// request bodies.
import { isApiError } from "../api";

const OFFLINE = "We couldn't reach the server. Check your connection and try again.";
const GENERIC = "Something went wrong on our end. Please try again in a moment.";

/** "about 15 minutes" from a Retry-After value in seconds. */
export function waitText(seconds: number | null): string {
  if (seconds === null || seconds <= 0) {
    return "a few minutes";
  }
  if (seconds < 60) {
    return "a minute";
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
}

export function rateLimitedMessage(error: unknown): string {
  const seconds = isApiError(error) ? error.retryAfterSeconds : null;
  return `Too many attempts in a short time. Please wait ${waitText(seconds)} and try again.`;
}

// Assumed contract: a failed Turnstile check is a 403, or a 400 naming the
// turnstileToken field.
const isTurnstileFailure = (error: unknown) =>
  isApiError(error) && (error.status === 403 || Object.hasOwn(error.fields, "turnstileToken"));

const TURNSTILE_FAILED = "We couldn't confirm you're a person. Please complete the check again.";

export function loginErrorMessage(error: unknown): string {
  if (!isApiError(error)) {
    return GENERIC;
  }
  if (isTurnstileFailure(error)) {
    return TURNSTILE_FAILED;
  }
  switch (error.status) {
    case 0:
      return OFFLINE;
    case 400:
    case 401:
      return "That username and password didn't match. Please try again.";
    case 429:
      return rateLimitedMessage(error);
    default:
      return GENERIC;
  }
}

export function registerErrorMessage(error: unknown): string {
  if (!isApiError(error)) {
    return GENERIC;
  }
  if (isTurnstileFailure(error)) {
    return TURNSTILE_FAILED;
  }
  switch (error.status) {
    case 0:
      return OFFLINE;
    case 400:
      return "Please fix the highlighted fields and try again.";
    case 409:
      return "That username is already taken. Try another one.";
    case 429:
      return rateLimitedMessage(error);
    default:
      return "That account could not be created. Please try again in a moment.";
  }
}

export function listingErrorMessage(error: unknown): string {
  if (!isApiError(error)) {
    return GENERIC;
  }
  switch (error.status) {
    case 0:
      return OFFLINE;
    case 400:
      return "The server couldn't accept that listing. Check the highlighted fields and try again.";
    case 401:
      return "Your session has ended. Please log in again.";
    case 404:
      return "That listing could not be found. It may have been removed, or it belongs to someone else.";
    case 413:
      return "That listing is too large. Shorten the description and try again.";
    case 429:
      return rateLimitedMessage(error);
    default:
      return GENERIC;
  }
}

export function loadErrorMessage(error: unknown, what: string): string {
  if (isApiError(error, 0)) {
    return `Could not load ${what}. Check your connection and try again.`;
  }
  return `Could not load ${what} right now. Please try again.`;
}

export function accountErrorMessage(error: unknown): string {
  if (!isApiError(error)) {
    return GENERIC;
  }
  switch (error.status) {
    case 0:
      return OFFLINE;
    case 400:
      return "Please fix the highlighted fields and try again.";
    case 429:
      return rateLimitedMessage(error);
    default:
      return GENERIC;
  }
}

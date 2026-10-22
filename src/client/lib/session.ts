import type { QueryClient } from "@tanstack/react-query";
import { clearSession, keys } from "./queries";

// The app-wide "session ended" handler, set once in main.tsx. Query and
// mutation 401s reach it through the QueryClient; direct API calls (forms
// that keep passwords out of the cache) call it themselves.
let handler: () => void = () => {};

export function setUnauthorizedHandler(next: () => void) {
  handler = next;
}

export function handleUnauthorized() {
  handler();
}

/**
 * Ends the session in the client, in an order that can't loop: mark `me` as
 * signed out (so loaders see a guest), leave the current page (unmounting
 * anything that would refetch signed-in data), then drop every cached query.
 */
export async function endSession(queryClient: QueryClient, leave: () => void | Promise<void>) {
  queryClient.setQueryData(keys.me, null);
  try {
    await leave();
  } finally {
    clearSession(queryClient);
  }
}

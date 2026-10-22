import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isApiError } from "./api";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}

type QueryMeta = {
  /** Handle a 401 locally (e.g. "wrong current password") instead of logging out. */
  skipAuthRedirect?: boolean;
};

/** Statuses that a retry can't fix. */
const NO_RETRY = new Set([400, 401, 403, 404, 409, 413, 415, 429]);

/**
 * Creates the app's QueryClient. `onUnauthorized` runs when any query or
 * mutation gets a 401 (the session expired or was revoked); the app uses it
 * to clear the whole cache and send the person to the login page.
 */
export function createQueryClient(onUnauthorized: () => void = () => {}) {
  const handle = (error: unknown, meta: QueryMeta | undefined) => {
    if (isApiError(error, 401) && !meta?.skipAuthRedirect) {
      onUnauthorized();
    }
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => handle(error, query.meta) }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => handle(error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          failureCount < 1 && !(isApiError(error) && NO_RETRY.has(error.status)),
      },
      mutations: { retry: false },
    },
  });
}

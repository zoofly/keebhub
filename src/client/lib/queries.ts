// Query keys, query options and mutations. Components use these instead of
// calling the API module directly, so caching and invalidation live in one place.
import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { PostingInput, User } from "../../shared/schemas";
import * as apiClient from "../api";
import { LISTINGS_PAGE_SIZE } from "./config";

export const keys = {
  me: ["me"] as const,
  myPostings: ["me", "postings"] as const,
  saved: ["me", "saved"] as const,
  savedIds: ["me", "saved", "ids"] as const,
  postings: ["postings"] as const,
  postingList: ["postings", "list"] as const,
  posting: (id: number) => ["postings", "detail", id] as const,
  switches: ["switches"] as const,
  config: ["config"] as const,
};

/** Public runtime config (Turnstile site key); the API caches it for 5 minutes. */
export const configQuery = queryOptions({
  queryKey: keys.config,
  queryFn: ({ signal }) => apiClient.getConfig(signal),
  staleTime: 5 * 60_000,
});

export const meQuery = queryOptions({
  queryKey: keys.me,
  queryFn: ({ signal }) => apiClient.getMe(signal),
  staleTime: 5 * 60_000,
});

/** The signed-in user (undefined while loading, null for guests). */
export function useMe() {
  return useQuery(meQuery).data;
}

const pageOptions = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined,
};

export const postingsQuery = infiniteQueryOptions({
  queryKey: keys.postingList,
  queryFn: ({ pageParam, signal }) =>
    apiClient.getPostings({ limit: LISTINGS_PAGE_SIZE, cursor: pageParam, signal }),
  ...pageOptions,
});

export const myPostingsQuery = infiniteQueryOptions({
  queryKey: keys.myPostings,
  queryFn: ({ pageParam, signal }) =>
    apiClient.getMyPostings({ limit: LISTINGS_PAGE_SIZE, cursor: pageParam, signal }),
  ...pageOptions,
});

export const savedQuery = infiniteQueryOptions({
  queryKey: keys.saved,
  queryFn: ({ pageParam, signal }) =>
    apiClient.getSaved({ limit: LISTINGS_PAGE_SIZE, cursor: pageParam, signal }),
  ...pageOptions,
});

/**
 * Every posting id the signed-in user has saved (GET /api/me/saved/ids, no
 * cap), so the Save toggles are right on every page of every list.
 */
export const savedIdsQuery = queryOptions({
  queryKey: keys.savedIds,
  queryFn: async ({ signal }) => new Set(await apiClient.getSavedIds(signal)),
});

export const postingQuery = (id: number) =>
  queryOptions({
    queryKey: keys.posting(id),
    queryFn: ({ signal }) => apiClient.getPosting(id, signal),
  });

export const switchesQuery = queryOptions({
  queryKey: keys.switches,
  queryFn: ({ signal }) => apiClient.getSwitches(signal),
  staleTime: 5 * 60_000,
});

/** Everything that shows postings needs a refetch after a write. */
function invalidatePostings(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.postings }),
    queryClient.invalidateQueries({ queryKey: keys.myPostings }),
    queryClient.invalidateQueries({ queryKey: keys.saved }),
  ]);
}

export function useCreatePosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PostingInput) => apiClient.createPosting(input),
    onSuccess: () => invalidatePostings(queryClient),
  });
}

export function useUpdatePosting(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PostingInput) => apiClient.updatePosting(id, input),
    onSuccess: (posting) => {
      queryClient.setQueryData(keys.posting(id), posting);
      return invalidatePostings(queryClient);
    },
  });
}

export function useDeletePosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.deletePosting(id),
    onSettled: (_data, error, id) => {
      // 204, or a 404 (gone already / not ours): either way refresh the lists.
      if (!error || apiClient.isApiError(error, 404)) {
        queryClient.removeQueries({ queryKey: keys.posting(id) });
      }
      // Not awaited: the caller's onSuccess (close the dialog, move focus off
      // the Delete button) must run while the card is still on screen. If
      // we waited for the refetch, the card - and the component holding
      // those callbacks - would already be gone, dropping focus to <body>.
      void invalidatePostings(queryClient);
    },
  });
}

/**
 * Save / unsave. The saved-ids cache is flipped synchronously on click
 * (so a fast double click reads the state the first click left, not a
 * stale render), then the request goes out. Toggles run one at a time
 * (mutation scope) so they reach the server in click order, and the lists
 * refetch once the last one settles. On failure the ids are refetched.
 */
export function useToggleSaved() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ["saved-toggle"],
    scope: { id: "saved-toggle" },
    mutationFn: async ({ id, save }: { id: number; save: boolean }) => {
      if (save) {
        await apiClient.savePosting(id);
      } else {
        await apiClient.unsavePosting(id);
      }
    },
    onError: () => queryClient.invalidateQueries({ queryKey: keys.savedIds }),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ["saved-toggle"] }) <= 1) {
        return queryClient.invalidateQueries({ queryKey: keys.saved });
      }
      return undefined;
    },
  });

  const toggle = (id: number, options?: { onError?: (saving: boolean) => void }) => {
    void queryClient.cancelQueries({ queryKey: keys.savedIds });
    const current = queryClient.getQueryData<Set<number>>(keys.savedIds) ?? new Set<number>();
    const save = !current.has(id);
    const next = new Set(current);
    if (save) {
      next.add(id);
    } else {
      next.delete(id);
    }
    queryClient.setQueryData(keys.savedIds, next);
    mutation.mutate(
      { id, save },
      options?.onError ? { onError: () => options.onError?.(save) } : undefined,
    );
  };

  return { toggle, isPending: mutation.isPending };
}

/** Signs in (or registers): store the user and drop anything cached for a guest. */
export function setSignedIn(queryClient: QueryClient, user: User) {
  queryClient.removeQueries({ queryKey: keys.myPostings });
  queryClient.removeQueries({ queryKey: keys.saved });
  queryClient.setQueryData(keys.me, user);
}

/**
 * Logout, account deletion and 401s: forget everything, not just `me`.
 * Every query and mutation is removed from the cache. `me` is reset to null
 * in place rather than removed, so components already showing it (the nav)
 * switch to the guest view immediately.
 */
export function clearSession(queryClient: QueryClient) {
  void queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: ({ queryKey }) => !(queryKey.length === 1 && queryKey[0] === keys.me[0]),
  });
  // (Public config is refetched on demand; it holds nothing about the user.)
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(keys.me, null);
}

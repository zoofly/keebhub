import { useInfiniteQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import type { PostingPage } from "../../shared/schemas";
import { loadErrorMessage } from "../lib/errors";
import { type keys, useMe } from "../lib/queries";
import { ListingCard } from "./ListingCard";
import { StatusMessage } from "./StatusMessage";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

type ListingsQuery = {
  queryKey: typeof keys.postingList | typeof keys.myPostings | typeof keys.saved;
  // The infinite query options from lib/queries.ts.
  // biome-ignore lint/suspicious/noExplicitAny: TanStack's option types are deeply generic
} & Record<string, any>;

type ListingGridProps = {
  query: ListingsQuery;
  /**
   * Signed-in data (my listings, saved): only fetch while someone is signed
   * in, so a page that's being left after logout or a 401 can't refetch.
   */
  requiresUser?: boolean;
  /** Plural noun for messages, e.g. "listings" or "saved listings". */
  what: string;
  empty: ReactNode;
};

function GridSkeleton() {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-5" aria-hidden="true">
      {[0, 1, 2].map((n) => (
        <li key={n} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
        </li>
      ))}
    </ul>
  );
}

/**
 * A keyset-paged grid of listings with a real "Load more" button (no silent
 * cap). After loading more, focus moves to the first new listing so keyboard
 * users continue where they left off.
 */
export function ListingGrid({ query, what, empty, requiresUser = false }: ListingGridProps) {
  const me = useMe();
  const result = useInfiniteQuery<PostingPage>({
    ...query,
    enabled: !requiresUser || Boolean(me),
  } as never);
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];
  const listRef = useRef<HTMLUListElement>(null);
  const focusIndex = useRef<number | null>(null);

  useEffect(() => {
    const index = focusIndex.current;
    if (index !== null && items.length > index) {
      focusIndex.current = null;
      listRef.current?.children[index]?.querySelector<HTMLElement>("[data-listing-link]")?.focus();
    }
  }, [items.length]);

  if (result.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="sr-only">
          Loading {what}…
        </p>
        <GridSkeleton />
      </div>
    );
  }

  if (result.isError && items.length === 0) {
    return (
      <StatusMessage
        variant="error"
        title={`The ${what} didn't load`}
        onRetry={() => void result.refetch()}
      >
        {loadErrorMessage(result.error, what)}
      </StatusMessage>
    );
  }

  if (items.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className="flex flex-col gap-6">
      <ul ref={listRef} className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-5">
        {items.map((posting) => (
          <li key={posting.id} className="flex">
            <ListingCard posting={posting} currentUserId={me?.id} />
          </li>
        ))}
      </ul>

      <p className="sr-only" aria-live="polite">
        Showing {items.length} {what}.
      </p>

      {result.isFetchNextPageError && (
        <StatusMessage
          variant="error"
          title="Couldn't load more"
          onRetry={() => void result.fetchNextPage()}
        >
          {loadErrorMessage(result.error, `more ${what}`)}
        </StatusMessage>
      )}

      {result.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="lg"
            disabled={result.isFetchingNextPage}
            onClick={() => {
              focusIndex.current = items.length;
              void result.fetchNextPage();
            }}
          >
            {result.isFetchingNextPage ? "Loading more…" : `Load more ${what}`}
          </Button>
        </div>
      ) : (
        (result.data?.pages.length ?? 0) > 1 && (
          <p className="text-center text-muted">You've reached the end.</p>
        )
      )}
    </div>
  );
}

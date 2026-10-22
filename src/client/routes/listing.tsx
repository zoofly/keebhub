import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { IdParam } from "../../shared/schemas";
import { isApiError } from "../api";
import { DeleteListingButton } from "../components/DeleteListingButton";
import { ListingImage } from "../components/ListingImage";
import { Page } from "../components/Page";
import { SaveButton } from "../components/SaveButton";
import { StatusMessage } from "../components/StatusMessage";
import { buttonVariants } from "../components/ui/button";
import { loadErrorMessage } from "../lib/errors";
import { displayDate, displayPrice } from "../lib/format";
import { postingQuery, useMe } from "../lib/queries";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { NotFoundPage } from "./not-found";

const LISTING_GONE = "That listing isn't available. It may have been sold or removed.";

/** The id from /market/:id (the route loader already rejected invalid ids). */
export function useListingId(): number {
  const { id } = useParams();
  return IdParam.parse(id);
}

export function ListingPage() {
  const id = useListingId();
  const me = useMe();
  const navigate = useNavigate();
  const result = useQuery(postingQuery(id));
  useDocumentTitle(result.data?.title ?? "Listing");

  if (result.isPending) {
    return (
      <Page>
        <StatusMessage variant="loading">Loading the listing…</StatusMessage>
      </Page>
    );
  }
  if (result.isError) {
    if (isApiError(result.error, 404)) {
      return <NotFoundPage title="Listing not found" message={LISTING_GONE} />;
    }
    return (
      <Page>
        <StatusMessage
          variant="error"
          title="The listing didn't load"
          onRetry={() => void result.refetch()}
        >
          {loadErrorMessage(result.error, "this listing")}
        </StatusMessage>
      </Page>
    );
  }

  const posting = result.data;
  const isOwner = me?.id === posting.userId;
  return (
    <Page>
      <p className="mb-4">
        <Link to="/market">← Back to the market</Link>
      </p>
      <article className="grid gap-8 md:grid-cols-2" aria-labelledby="listing-title">
        <ListingImage
          src={posting.imageUrl}
          alt={posting.title}
          eager
          className="rounded-xl border border-line"
        />
        <div className="flex flex-col gap-3">
          <h1 id="listing-title" className="text-4xl [overflow-wrap:anywhere] sm:text-5xl">
            {posting.title}
          </h1>
          <p className="text-2xl font-bold text-primary">{displayPrice(posting.priceCents)}</p>
          <p className="text-muted">
            {isOwner ? "Your listing" : `Sold by ${posting.sellerUsername}`} · Posted{" "}
            {displayDate(posting.createdAt)}
          </p>
          {posting.description ? (
            <p className="whitespace-pre-line [overflow-wrap:anywhere]">{posting.description}</p>
          ) : (
            <p className="text-muted">No description.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-3">
            {isOwner ? (
              <>
                <Link
                  to={`/market/${posting.id}/edit`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Edit listing
                </Link>
                <DeleteListingButton
                  postingId={posting.id}
                  title={posting.title}
                  size="md"
                  onDeleted={() => void navigate("/mylistings", { replace: true })}
                />
              </>
            ) : (
              <SaveButton postingId={posting.id} title={posting.title} />
            )}
          </div>
        </div>
      </article>
    </Page>
  );
}

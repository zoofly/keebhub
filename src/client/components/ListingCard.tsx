import { useId, useState } from "react";
import { Link } from "react-router";
import type { PostingWithSeller } from "../../shared/schemas";
import { cn } from "../lib/cn";
import { displayPrice } from "../lib/format";
import { DeleteListingButton } from "./DeleteListingButton";
import { ListingImage } from "./ListingImage";
import { SaveButton } from "./SaveButton";
import { buttonVariants } from "./ui/button";

// Long descriptions are collapsed behind a "Show more" toggle.
const LONG_DESCRIPTION = 220;

type ListingCardProps = {
  posting: PostingWithSeller;
  /** The signed-in user's id; owners get Edit and Delete instead of Save. */
  currentUserId: number | null | undefined;
  headingLevel?: "h2" | "h3";
  onDeleted?: () => void;
};

export function ListingCard({
  posting,
  currentUserId,
  headingLevel: Heading = "h2",
  onDeleted,
}: ListingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const isOwner = currentUserId != null && posting.userId === currentUserId;
  const isLong = posting.description.length > LONG_DESCRIPTION;

  return (
    <article
      aria-labelledby={titleId}
      data-testid="listing-card"
      className="flex w-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-shadow hover:shadow-lg"
    >
      <ListingImage src={posting.imageUrl} alt={posting.title} />
      <div className="flex flex-1 flex-col gap-1 p-4">
        <Heading id={titleId} className="text-2xl [overflow-wrap:anywhere]">
          <Link
            to={`/market/${posting.id}`}
            className="text-ink no-underline hover:text-primary hover:underline"
            data-listing-link
          >
            {posting.title}
          </Link>
        </Heading>
        <p className="text-xl font-bold text-primary" data-testid="listing-price">
          {displayPrice(posting.priceCents)}
        </p>
        <p className="text-sm text-muted">
          {isOwner ? "Your listing" : `Sold by ${posting.sellerUsername}`}
        </p>
        {posting.description && (
          <p
            id={descriptionId}
            className={cn(
              "mt-2 whitespace-pre-line text-muted [overflow-wrap:anywhere]",
              isLong && !expanded && "line-clamp-4",
            )}
          >
            {posting.description}
          </p>
        )}
        {isLong && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={descriptionId}
            onClick={() => setExpanded(!expanded)}
            className="self-start py-1 font-semibold text-primary underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4">
        {isOwner ? (
          <>
            <Link
              to={`/market/${posting.id}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
              aria-label={`Edit ${posting.title}`}
            >
              Edit
            </Link>
            <div className="flex flex-1 [&>button]:flex-1">
              <DeleteListingButton
                postingId={posting.id}
                title={posting.title}
                {...(onDeleted ? { onDeleted } : {})}
              />
            </div>
          </>
        ) : (
          <SaveButton postingId={posting.id} title={posting.title} />
        )}
      </div>
    </article>
  );
}

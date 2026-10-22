import { useState } from "react";
import { ImageUrl } from "../../shared/schemas";
import { cn } from "../lib/cn";
import { PhotoIcon } from "./Icons";

/**
 * A listing photo in a fixed 4:3 box. Only https URLs are rendered, without
 * a Referer (so image hosts can't see which listing is being viewed), lazily,
 * and with a placeholder if the link is missing, not https, or fails to load.
 */
export function ListingImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = ImageUrl.safeParse(src).success && failedSrc !== src;

  return (
    <div className={cn("aspect-[4/3] overflow-hidden bg-primary-soft", className)}>
      {usable ? (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError detects a broken link, it isn't a user interaction
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="block size-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={`No photo available for ${alt}`}
          className="flex size-full flex-col items-center justify-center gap-1 text-muted"
        >
          <PhotoIcon />
          <span className="text-sm font-semibold">No photo</span>
        </div>
      )}
    </div>
  );
}

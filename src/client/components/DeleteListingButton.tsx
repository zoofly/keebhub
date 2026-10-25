import { useRef, useState } from "react";
import { isApiError } from "../api";
import { listingErrorMessage } from "../lib/errors";
import { focusPageHeading } from "../lib/focus";
import { useDeletePosting } from "../lib/queries";
import { toast } from "../lib/toast";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/confirm-dialog";

/**
 * Delete with a confirm dialog; the result toast reflects the real response.
 * After a successful delete this button (and its card) is about to vanish, so
 * focus moves to the page's <h1>, and "Listing deleted" is announced by the
 * toaster's polite live region.
 */
export function DeleteListingButton({
  postingId,
  title,
  onDeleted,
  size = "sm",
}: {
  postingId: number;
  title: string;
  onDeleted?: () => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const deleted = useRef(false);
  const remove = useDeletePosting();

  return (
    <>
      {/* The name starts with the visible text (WCAG 2.5.3) and says which listing. */}
      <Button
        variant="danger"
        size={size}
        onClick={() => setOpen(true)}
        aria-label={`Delete ${title}`}
      >
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete this listing?"
        description={<p>“{title}” will be removed from the market. This can’t be undone.</p>}
        confirmLabel="Delete listing"
        busyLabel="Deleting…"
        busy={remove.isPending}
        onCancel={() => setOpen(false)}
        focusAfterClose={() => (deleted.current ? focusPageHeading() : null)}
        onConfirm={() =>
          remove.mutate(postingId, {
            onSuccess: () => {
              deleted.current = true;
              setOpen(false);
              toast.success("Listing deleted");
              onDeleted?.();
            },
            onError: (error) => {
              setOpen(false);
              if (!isApiError(error, 401)) {
                toast.error("Couldn't delete listing", listingErrorMessage(error));
              }
            },
          })
        }
      />
    </>
  );
}

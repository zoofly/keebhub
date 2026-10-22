import { useState } from "react";
import { isApiError } from "../api";
import { listingErrorMessage } from "../lib/errors";
import { useDeletePosting } from "../lib/queries";
import { toast } from "../lib/toast";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/confirm-dialog";

/** Delete with a confirm dialog; the result toast reflects the real response. */
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
        onConfirm={() =>
          remove.mutate(postingId, {
            onSuccess: () => {
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

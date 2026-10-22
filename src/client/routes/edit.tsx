import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { centsToDollarString } from "../../shared/money";
import { isApiError } from "../api";
import { ListingForm } from "../components/ListingForm";
import { Page, PageHeader } from "../components/Page";
import { StatusMessage } from "../components/StatusMessage";
import { Card } from "../components/ui/card";
import { loadErrorMessage } from "../lib/errors";
import { postingQuery, useMe, useUpdatePosting } from "../lib/queries";
import { toast } from "../lib/toast";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useListingId } from "./listing";
import { NotFoundPage } from "./not-found";

const NOT_YOURS =
  "That listing could not be found, or it belongs to someone else. You can only edit your own listings.";

export function EditPage() {
  useDocumentTitle("Edit listing");
  const id = useListingId();
  const me = useMe();
  const navigate = useNavigate();
  const result = useQuery(postingQuery(id));
  const update = useUpdatePosting(id);

  if (result.isPending) {
    return (
      <Page narrow>
        <StatusMessage variant="loading">Loading the listing…</StatusMessage>
      </Page>
    );
  }
  if (result.isError && !isApiError(result.error, 404)) {
    return (
      <Page narrow>
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
  // Same message for "missing" and "not yours", like the API's 404.
  if (result.isError || result.data.userId !== me?.id) {
    return <NotFoundPage title="Can't edit this listing" message={NOT_YOURS} />;
  }

  const posting = result.data;
  return (
    <Page narrow>
      <PageHeader title="Edit listing" lede="Fields marked * are required." />
      <Card className="p-4 sm:p-6">
        <ListingForm
          defaultValues={{
            title: posting.title,
            description: posting.description,
            imageUrl: posting.imageUrl,
            price: centsToDollarString(posting.priceCents),
          }}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          cancelHref={`/market/${id}`}
          onCancel={() => void navigate(`/market/${id}`)}
          onSubmit={async (input) => {
            await update.mutateAsync(input);
            toast.success("Listing updated");
            await navigate(`/market/${id}`);
          }}
        />
      </Card>
    </Page>
  );
}

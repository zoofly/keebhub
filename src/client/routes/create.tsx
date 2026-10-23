import { useNavigate } from "react-router";
import { ListingForm } from "../components/ListingForm";
import { Page, PageHeader } from "../components/Page";
import { Card } from "../components/ui/card";
import { useCreatePosting } from "../lib/queries";
import { toast } from "../lib/toast";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function CreatePage() {
  useDocumentTitle("Create a listing");
  const navigate = useNavigate();
  const create = useCreatePosting();

  return (
    <Page narrow>
      <PageHeader title="Create a listing" lede="Fields marked * are required." />
      <Card className="p-4 sm:p-6">
        <ListingForm
          submitLabel="Post listing"
          pendingLabel="Posting…"
          cancelHref="/market"
          onCancel={() => void navigate(-1)}
          onSubmit={async (input) => {
            // Resolves only after the API accepted it, so the toast is true.
            const posting = await create.mutateAsync(input);
            toast.success("Listing posted!", "It's now live on the market.");
            await navigate(`/market/${posting.id}`);
          }}
        />
      </Card>
    </Page>
  );
}

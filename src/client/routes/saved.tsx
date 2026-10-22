import { Link } from "react-router";
import { ListingGrid } from "../components/ListingGrid";
import { Page, PageHeader } from "../components/Page";
import { StatusMessage } from "../components/StatusMessage";
import { buttonVariants } from "../components/ui/button";
import { savedQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function SavedPage() {
  useDocumentTitle("Saved listings");
  return (
    <Page>
      <PageHeader title="Saved listings" lede="Listings you've saved to come back to." />
      <ListingGrid
        requiresUser
        query={savedQuery}
        what="saved listings"
        empty={
          <StatusMessage
            title="No saved listings yet"
            action={
              <Link to="/market" className={buttonVariants()}>
                Browse the market
              </Link>
            }
          >
            Use the Save button on any listing to keep it here.
          </StatusMessage>
        }
      />
    </Page>
  );
}

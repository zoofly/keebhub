import { Link } from "react-router";
import { ListingGrid } from "../components/ListingGrid";
import { Page, PageHeader } from "../components/Page";
import { StatusMessage } from "../components/StatusMessage";
import { buttonVariants } from "../components/ui/button";
import { postingsQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function MarketPage() {
  useDocumentTitle("Market");
  return (
    <Page>
      <PageHeader
        title="Market"
        lede="Keyboards, switches, keycaps, and parts from the community."
        actions={
          <Link to="/create" className={buttonVariants({ size: "lg" })}>
            Create a listing
          </Link>
        }
      />
      <ListingGrid
        query={postingsQuery}
        what="listings"
        empty={
          <StatusMessage
            title="No listings yet"
            action={
              <Link to="/create" className={buttonVariants()}>
                Create the first listing
              </Link>
            }
          >
            Be the first to post a keyboard, switches, or keycaps.
          </StatusMessage>
        }
      />
    </Page>
  );
}

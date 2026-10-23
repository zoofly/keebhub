import { Link } from "react-router";
import { ListingGrid } from "../components/ListingGrid";
import { Page, PageHeader } from "../components/Page";
import { StatusMessage } from "../components/StatusMessage";
import { buttonVariants } from "../components/ui/button";
import { myPostingsQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function MyListingsPage() {
  useDocumentTitle("My listings");
  return (
    <Page>
      <PageHeader
        title="My listings"
        lede="Everything you've posted. Edit or remove listings here."
        actions={
          <Link to="/create" className={buttonVariants({ size: "lg" })}>
            Create a listing
          </Link>
        }
      />
      <ListingGrid
        requiresUser
        query={myPostingsQuery}
        what="listings"
        empty={
          <StatusMessage
            title="You haven't listed anything yet"
            action={
              <Link to="/create" className={buttonVariants()}>
                Create a listing
              </Link>
            }
          >
            Listings you create will show up here so you can edit or remove them.
          </StatusMessage>
        }
      />
    </Page>
  );
}

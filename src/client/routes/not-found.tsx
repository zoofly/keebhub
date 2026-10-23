import { Link } from "react-router";
import { Page } from "../components/Page";
import { buttonVariants } from "../components/ui/button";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function NotFoundPage({
  title = "Page not found",
  message = "We couldn't find that page. It may have moved, or the link might be mistyped.",
}: {
  title?: string;
  message?: string;
}) {
  useDocumentTitle(title);
  return (
    <Page narrow>
      <h1 className="text-5xl">{title}</h1>
      <p className="mt-2 mb-6 text-lg text-muted">{message}</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/" className={buttonVariants()}>
          Go to the home page
        </Link>
        <Link to="/market" className={buttonVariants({ variant: "outline" })}>
          Browse the market
        </Link>
      </div>
    </Page>
  );
}

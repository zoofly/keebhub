import { isRouteErrorResponse, useRouteError } from "react-router";
import { Page } from "../components/Page";
import { Button } from "../components/ui/button";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { NotFoundPage } from "./not-found";

/** Route error boundary: 404s get the not-found page, anything else a retry. */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }
  return <UnexpectedError />;
}

function UnexpectedError() {
  useDocumentTitle("Something went wrong");
  return (
    <Page narrow>
      <div role="alert">
        <h1 className="text-5xl">Something went wrong</h1>
        <p className="mt-2 mb-6 text-lg text-muted">
          This page hit an unexpected problem. Reloading usually fixes it. If it keeps happening,
          check your connection and try again later.
        </p>
      </div>
      <Button onClick={() => window.location.reload()}>Reload the page</Button>
    </Page>
  );
}

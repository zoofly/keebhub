import { Link, useSearchParams } from "react-router";
import { LoginFormCard, RegisterFormCard } from "../components/AuthForms";
import { Page } from "../components/Page";
import { safeNextPath } from "../lib/safeNext";
import { useDocumentTitle } from "../lib/useDocumentTitle";

function useNext() {
  const [params] = useSearchParams();
  return safeNextPath(params.get("next"));
}

/** Keeps ?next= when switching between the login and register pages. */
const withNext = (path: string, next: string | null) =>
  next ? `${path}?next=${encodeURIComponent(next)}` : path;

export function LoginPage() {
  useDocumentTitle("Log in");
  const next = useNext();
  return (
    <Page>
      <LoginFormCard next={next} />
      <p className="mt-4 text-center text-muted">
        New to Keebhub?{" "}
        <Link to={withNext("/register", next)} className="font-semibold">
          Create an account
        </Link>
      </p>
    </Page>
  );
}

export function RegisterPage() {
  useDocumentTitle("Create an account");
  const next = useNext();
  return (
    <Page>
      <RegisterFormCard next={next} />
      <p className="mt-4 text-center text-muted">
        Already have an account?{" "}
        <Link to={withNext("/login", next)} className="font-semibold">
          Log in
        </Link>
      </p>
    </Page>
  );
}

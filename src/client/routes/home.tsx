import { Link } from "react-router";
import { RegisterFormCard } from "../components/AuthForms";
import { Page } from "../components/Page";
import { SwitchGuide } from "../components/SwitchGuide";
import { buttonVariants } from "../components/ui/button";
import { cn } from "../lib/cn";
import { useMe } from "../lib/queries";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function HomePage() {
  useDocumentTitle(null);
  const me = useMe();
  const guest = me === null;

  return (
    <Page>
      <section
        aria-labelledby="home-heading"
        className={cn(
          "grid grid-cols-1 items-center gap-8 rounded-2xl border border-line bg-linear-to-br from-primary-soft to-surface p-5 sm:p-8",
          guest && "lg:grid-cols-[1.2fr_1fr]",
        )}
      >
        <div>
          <p className="mb-2 text-sm font-bold tracking-widest text-primary uppercase">
            The mechanical keyboard marketplace
          </p>
          <h1 id="home-heading" className="text-5xl [overflow-wrap:anywhere] sm:text-6xl">
            {me ? `Welcome back, ${me.username}!` : "Welcome to Keebhub"}
          </h1>
          <p className="mt-3 mb-6 max-w-prose text-lg text-muted">
            Buy, sell, and trade keyboards, switches, and keycaps with people in the community. No
            more sifting through forum threads that send you to vendors you've never heard of.
          </p>
          <div className="flex flex-wrap gap-3 [&>*]:max-sm:flex-1">
            <Link to="/market" className={buttonVariants({ size: "lg" })}>
              Browse the market
            </Link>
            {me ? (
              <Link to="/create" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Create a listing
              </Link>
            ) : (
              <Link to="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
                I already have an account
              </Link>
            )}
          </div>
        </div>
        {guest && <RegisterFormCard next={null} headingLevel="h2" />}
      </section>
      <SwitchGuide />
    </Page>
  );
}

import { useEffect, useRef } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { Footer } from "./Footer";
import { Nav } from "./Nav";
import { SkipLink } from "./SkipLink";
import { Toaster } from "./Toaster";

/**
 * Moves keyboard and screen reader focus to <main> after each client-side
 * navigation (SPAs don't do this on their own). The first render is left
 * alone so the skip link stays the first Tab stop on page load.
 */
function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every route change
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <Nav />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <Toaster />
      <RouteFocus />
      <ScrollRestoration />
    </div>
  );
}

/** Shown while the first route's loader runs (e.g. the session check). */
export function AppLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page">
      <p role="status" className="text-muted">
        Loading Keebhub…
      </p>
    </div>
  );
}

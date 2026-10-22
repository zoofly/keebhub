import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { useMe } from "../lib/queries";
import { LogoutButton } from "./LogoutButton";

type NavItem = { to: string; label: string; cta?: boolean };

const shared: NavItem[] = [
  { to: "/market", label: "Market" },
  { to: "/about", label: "About" },
];
const guestLinks: NavItem[] = [
  { to: "/", label: "Home" },
  ...shared,
  { to: "/login", label: "Log in" },
  { to: "/register", label: "Sign up", cta: true },
];
const memberLinks: NavItem[] = [
  { to: "/market", label: "Market" },
  { to: "/mylistings", label: "My listings" },
  { to: "/saved", label: "Saved" },
  { to: "/create", label: "Sell" },
  { to: "/profile", label: "Profile" },
  { to: "/about", label: "About" },
];

const linkClasses =
  "block w-full rounded-lg px-3 py-3 text-left font-medium text-white no-underline hover:bg-white/15 hover:text-white md:py-2";

export function Nav() {
  const me = useMe();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Until we know who's signed in, show only the links everyone gets.
  const links = me === undefined ? shared : me ? memberLinks : guestLinks;

  // Close the phone menu after navigating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // ...and with Escape.
  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        document.getElementById("nav-toggle")?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-primary-dark text-white shadow-md [--color-focus:var(--color-accent)]">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-4 px-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 font-heading text-3xl tracking-wider text-white no-underline hover:text-white"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-9 items-center justify-center rounded-md bg-white text-2xl text-primary-dark shadow-[inset_0_-4px_0_#cbbfe0]"
          >
            K
          </span>
          Keebhub
        </Link>

        <button
          id="nav-toggle"
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/60 px-3 font-semibold md:hidden"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span aria-hidden="true" className="flex w-4.5 flex-col gap-1">
            <span className="h-0.5 rounded bg-current" />
            <span className="h-0.5 rounded bg-current" />
            <span className="h-0.5 rounded bg-current" />
          </span>
          Menu
        </button>

        <nav
          id="primary-nav"
          aria-label="Main"
          className={cn("basis-full pb-3 md:block md:basis-auto md:pb-0", !menuOpen && "hidden")}
        >
          <ul className="flex flex-col gap-1 md:flex-row md:items-center">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      linkClasses,
                      isActive && "bg-white/20 shadow-[inset_0_-3px_0_var(--color-accent)]",
                      link.cta &&
                        "bg-white font-semibold text-primary-dark hover:bg-primary-soft hover:text-primary-dark",
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            {me && (
              <li>
                <LogoutButton className={cn(linkClasses, "cursor-pointer")} />
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

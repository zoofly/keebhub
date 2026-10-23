/**
 * First focusable element on every page. A plain fragment link: browsers
 * move focus to the focusable (tabIndex=-1) <main id="main-content">.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="absolute -top-24 left-4 z-[60] rounded-lg bg-surface px-4 py-2 font-semibold text-primary-dark shadow focus:top-2"
    >
      Skip to main content
    </a>
  );
}

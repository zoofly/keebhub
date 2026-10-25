/**
 * Moves focus to the current page's <h1> (made focusable on the fly with
 * tabIndex=-1). Used when the control that had focus is about to disappear,
 * e.g. the Delete button of a listing that was just deleted, so keyboard and
 * screen reader users aren't dropped on <body>.
 */
export function focusPageHeading(): HTMLElement | null {
  const heading = document.querySelector<HTMLElement>("main h1");
  if (!heading) {
    return null;
  }
  if (!heading.hasAttribute("tabindex")) {
    heading.tabIndex = -1;
  }
  heading.focus();
  return heading;
}

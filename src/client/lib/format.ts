import { formatPrice } from "../../shared/money";

/** "$199.99", or "Free / trade" for 0 (as the legacy cards showed). */
export function displayPrice(cents: number): string {
  return cents === 0 ? "Free / trade" : formatPrice(cents);
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function displayDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

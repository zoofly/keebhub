import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

/** Decorative loading placeholder; pair it with a text status for screen readers. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-primary-soft", className)}
      {...props}
    />
  );
}

import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** Page container: centred, 16px gutters on phones. */
export function Page({
  narrow = false,
  className,
  children,
}: {
  narrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 pt-8 pb-12",
        narrow ? "max-w-2xl" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** h1 + optional lede + optional actions, wrapping on small screens. */
export function PageHeader({
  title,
  lede,
  actions,
}: {
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-4xl sm:text-5xl">{title}</h1>
        {lede && <p className="mt-1 text-lg text-muted">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

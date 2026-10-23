import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "./ui/button";

type StatusMessageProps = {
  variant?: "loading" | "error" | "empty";
  title?: string;
  children?: ReactNode;
  onRetry?: () => void;
  /** Extra action, e.g. a link styled as a button. */
  action?: ReactNode;
  className?: string;
};

/**
 * One place for loading, error and empty states so every page shows and
 * announces them the same way (ported from the legacy StatusMessage).
 */
export function StatusMessage({
  variant = "empty",
  title,
  children,
  onRetry,
  action,
  className,
}: StatusMessageProps) {
  if (variant === "loading") {
    return (
      <div
        role="status"
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="size-8 animate-spin rounded-full border-4 border-primary-soft border-t-primary"
        />
        <p className="text-muted">{children ?? "Loading…"}</p>
      </div>
    );
  }

  const isError = variant === "error";
  return (
    <div
      role={isError ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border px-4 py-10 text-center",
        isError ? "border-danger bg-danger-soft" : "border-dashed border-line bg-surface",
        className,
      )}
    >
      {title && <p className={cn("text-lg font-semibold", isError && "text-danger")}>{title}</p>}
      {children && <p className="max-w-prose text-muted">{children}</p>}
      {(onRetry || action) && (
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

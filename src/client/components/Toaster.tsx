import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "../lib/cn";
import { type Toast, toastStore } from "../lib/toast";

const AUTO_DISMISS_MS = 6000;

function ToastItem({ toast }: { toast: Toast }) {
  const [paused, setPaused] = useState(false);
  const dismiss = () => toastStore.dismiss(toast.id);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  // Auto-dismiss, paused while hovered or focused (WCAG 2.2.1).
  useEffect(() => {
    if (paused) {
      return undefined;
    }
    const timer = window.setTimeout(() => dismissRef.current(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [paused]);

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: hover/focus only pause the auto-dismiss timer
    <li
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface p-4 shadow-lg",
        toast.tone === "error" ? "border-danger" : "border-line",
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 size-2.5 shrink-0 rounded-full",
          toast.tone === "success" && "bg-success",
          toast.tone === "error" && "bg-danger",
          toast.tone === "info" && "bg-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold", toast.tone === "error" && "text-danger")}>
          {toast.title}
        </p>
        {toast.description && <p className="text-sm text-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="-m-1 rounded p-1 text-muted hover:text-ink"
        aria-label={`Dismiss: ${toast.title}`}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

/**
 * Renders toasts in two always-present live regions (polite for success and
 * info, assertive for errors), so screen readers announce them reliably.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
  const polite = toasts.filter((toast) => toast.tone !== "error");
  const assertive = toasts.filter((toast) => toast.tone === "error");

  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      <ol aria-live="assertive" className="flex w-full max-w-sm flex-col gap-2">
        {assertive.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </ol>
      <ol aria-live="polite" className="flex w-full max-w-sm flex-col gap-2">
        {polite.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </ol>
    </section>
  );
}

import { type ComponentProps, useEffect, useRef } from "react";
import { cn } from "../../lib/cn";

/**
 * A form-level error. It is announced (role="alert") and takes focus when it
 * appears so keyboard and screen reader users land on it.
 */
export function FormAlert({
  className,
  children,
  focusOnShow = true,
  ...props
}: ComponentProps<"div"> & { focusOnShow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnShow && children) {
      ref.current?.focus();
    }
  }, [children, focusOnShow]);

  if (!children) {
    return null;
  }
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(
        "rounded-lg border-l-4 border-danger bg-danger-soft px-4 py-3 font-medium text-danger",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const fieldClasses =
  "block w-full rounded-lg border border-[#8a80a0] bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted aria-invalid:border-danger aria-invalid:border-2";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClasses, "min-h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClasses, "min-h-32", className)} {...props} />;
}

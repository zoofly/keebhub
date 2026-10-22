import { cloneElement, type ReactElement, useId } from "react";
import { cn } from "../../lib/cn";

type FieldProps = {
  label: string;
  /** Help text shown under the input (linked with aria-describedby). */
  hint?: string | undefined;
  /** Error message; marks the input aria-invalid and is announced with it. */
  error?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  /** The input element. Its id and aria-* props are filled in here. */
  children: ReactElement<Record<string, unknown>>;
};

/**
 * Label + input + hint + error with the ids wired up, so every form field
 * gets the same accessible structure.
 */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-danger">
              {" "}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
        "aria-required": required ? true : undefined,
      })}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "./button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while `busy`. */
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra content between the description and the buttons (e.g. a password field). */
  children?: ReactNode;
  /** Wrap the body in a <form> so Enter submits (used with `children` fields). */
  asForm?: boolean;
};

/**
 * A modal confirm built on the native <dialog> element (replaces sweetalert
 * and Radix AlertDialog, whose scroll lock injects a <style> element that
 * the CSP blocks). showModal() makes the rest of the page inert, traps focus,
 * and closes on Escape; focus starts on Cancel and returns to the opener.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busyLabel,
  busy = false,
  onConfirm,
  onCancel,
  children,
  asForm = false,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      if (!children) {
        cancelRef.current?.focus();
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
      if (opener.current instanceof HTMLElement && opener.current.isConnected) {
        opener.current.focus();
      }
    }
  }, [open, children]);

  const body = (
    <>
      <h2 id={titleId} className="text-2xl">
        {title}
      </h2>
      <div id={descriptionId} className="mt-2 text-muted">
        {description}
      </div>
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button ref={cancelRef} variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="dangerSolid"
          type={asForm ? "submit" : "button"}
          onClick={asForm ? undefined : onConfirm}
          disabled={busy}
        >
          {busy && busyLabel ? busyLabel : confirmLabel}
        </Button>
      </div>
    </>
  );

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // Escape: let React state drive closing so focus handling stays in one place.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          onCancel();
        }
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-6 text-ink shadow-xl"
    >
      {asForm ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          {body}
        </form>
      ) : (
        body
      )}
    </dialog>
  );
}

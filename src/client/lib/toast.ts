// A tiny toast store (replaces sweetalert / sonner). Sonner injects a <style>
// element at runtime, which the planned `style-src 'self'` CSP blocks, so
// toasts are plain React + Tailwind instead. See components/Toaster.tsx.

export type ToastTone = "success" | "error" | "info";
export type Toast = { id: number; tone: ToastTone; title: string; description?: string };

type Listener = () => void;

let toasts: readonly Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const toastStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => toasts,
  dismiss(id: number) {
    toasts = toasts.filter((toast) => toast.id !== id);
    emit();
  },
  clear() {
    toasts = [];
    emit();
  },
};

function push(tone: ToastTone, title: string, description?: string) {
  const toast: Toast = description
    ? { id: nextId, tone, title, description }
    : { id: nextId, tone, title };
  nextId += 1;
  // Keep the newest few; older ones drop off.
  toasts = [...toasts, toast].slice(-4);
  emit();
  return toast.id;
}

export const toast = {
  success: (title: string, description?: string) => push("success", title, description),
  error: (title: string, description?: string) => push("error", title, description),
  info: (title: string, description?: string) => push("info", title, description),
};

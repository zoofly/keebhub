import { useEffect } from "react";

/** Sets the tab title ("Market · Keebhub") so every page is distinguishable. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Keebhub` : "Keebhub";
  }, [title]);
}

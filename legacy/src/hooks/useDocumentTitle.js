import { useEffect } from 'react';

// Sets the browser tab title so each page is distinguishable
// (also announced by screen readers on navigation).
const useDocumentTitle = (title) => {
  useEffect(() => {
    document.title = title ? `${title} · Keebhub` : 'Keebhub';
  }, [title]);
};

export default useDocumentTitle;

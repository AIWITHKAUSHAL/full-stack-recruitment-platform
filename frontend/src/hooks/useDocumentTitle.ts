import { useEffect } from 'react';

const SUFFIX = 'Mini Job Board Application Tracker';

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
  }, [title]);
}

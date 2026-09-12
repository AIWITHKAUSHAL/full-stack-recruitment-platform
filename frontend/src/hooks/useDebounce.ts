import { useEffect, useState } from 'react';

/**
 * Delays a fast-changing value (the search box) so that typing "engineer" sends
 * one request instead of eight.
 */
export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

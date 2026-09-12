import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, toApiError } from '@/api/client';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
}

/**
 * One place that knows how to run an API call and expose loading / error /
 * data. Without it every page reimplements the same three useStates and
 * eventually one of them forgets the error branch.
 *
 * `deps` behaves like a useEffect dependency array: the request re-runs when it
 * changes, and results from a superseded request are discarded.
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  // The fetcher closure is recreated on every render; keeping it in a ref means
  // only `deps` decides when the request re-runs.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const current = ++requestId.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    fetcherRef
      .current()
      .then((data) => {
        if (current === requestId.current) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (current === requestId.current) {
          setState({ data: null, loading: false, error: toApiError(error) });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, reload };
}

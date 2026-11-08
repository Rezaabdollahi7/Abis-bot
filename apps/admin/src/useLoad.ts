import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

/**
 * GETs `path` on mount and whenever it changes; `reload` refetches.
 * Responses for a path that is no longer current are dropped, so a slow
 * earlier search can never overwrite the results of a newer one.
 */
export function useLoad<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let current = true;
    setError(undefined);
    apiFetch<T>(path)
      .then((result) => {
        if (current) setData(result);
      })
      .catch((err: unknown) => {
        if (current) setError(String(err));
      });
    return () => {
      current = false;
    };
  }, [path, version]);

  return { data, error, reload };
}

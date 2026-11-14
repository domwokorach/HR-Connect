import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/services/api';

export interface AsyncState<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

/**
 * Minimal data hook: runs `fn` on mount and whenever `deps` change; `reload` re-runs it.
 * State is only set from the async callbacks, never synchronously inside the effect.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    let cancelled = false;
    fnRef.current().then(
      (v) => { if (!cancelled) { setData(v); setError(null); setLoading(false); } },
      (e) => { if (!cancelled) { setError(errorMessage(e)); setLoading(false); } },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

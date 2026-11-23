import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '@/services/api';

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
    // One bounded automatic retry, only for transient failures (no response / 502-504). Auth, permission and 4xx errors are never retried.
    const run = (attempt: number) => fnRef.current().then(
      (v) => { if (!cancelled) { setData(v); setError(null); setLoading(false); } },
      (e) => {
        if (cancelled) return;
        const d = describeError(e);
        if (d.retryable && attempt === 0) { retryTimer = setTimeout(() => run(1), 1200); return; }
        setError(d.message); setLoading(false);
      },
    );
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    run(0);
    return () => { cancelled = true; clearTimeout(retryTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  // Show the loading state (and clear the stale error) while a manual retry runs; sections already loaded stay on screen.
  const reload = useCallback(() => { setLoading(true); setError(null); setTick((t) => t + 1); }, []);
  return { data, error, loading, reload };
}

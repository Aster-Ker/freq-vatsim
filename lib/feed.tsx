import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { fetchFeed, type FeedSnapshot } from './vatsim';

/** The feed is rebuilt every 15 s; polling at 30 s halves the requests and is still current. */
const POLL_MS = 30_000;

type FeedState = {
  data: FeedSnapshot | null;
  error: string | null;
  loading: boolean;
  /** When this device last received a good copy. */
  fetchedAt: number | null;
  refresh: () => void;
};

const FeedContext = createContext<FeedState | null>(null);

export function FeedProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FeedSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    try {
      const snapshot = await fetchFeed(ctrl.signal);
      setData(snapshot);
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(
        e instanceof Error && e.message.startsWith('The VATSIM')
          ? e.message
          : 'Could not reach the VATSIM feed. Check your connection and try again.'
      );
    } finally {
      if (inflight.current === ctrl) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      void load();
      timer = setInterval(load, POLL_MS);
    };
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
      inflight.current?.abort();
    };

    startPolling();
    // No one is looking at the list in the background, so the feed rests while
    // the audio keeps playing.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !timer) startPolling();
      else if (state !== 'active') stopPolling();
    });
    return () => {
      sub.remove();
      stopPolling();
    };
  }, [load]);

  return (
    <FeedContext.Provider value={{ data, error, loading, fetchedAt, refresh: load }}>
      {children}
    </FeedContext.Provider>
  );
}

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error('useFeed must be used inside FeedProvider');
  return ctx;
}

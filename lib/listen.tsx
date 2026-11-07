import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  addStopRequestListener,
  requestNotificationPermission,
  startBackgroundSession,
  stopBackgroundSession,
} from '@/modules/freq-playback';
import { usePrefs } from './prefs';
import { facilityLabel, type Station } from './vatsim';

/**
 * A local tally of listening time over the last 60 minutes: only time the
 * Listen page was actually playing, in this app, on this phone. VATSIM sets
 * and enforces any limit itself (it can change it or turn it off), so the app
 * shows the time without claiming a limit.
 */
const HOUR_MS = 60 * 60 * 1000;
const USAGE_KEY = 'freq.usage.v1';

export type ListenStatus = 'idle' | 'loading' | 'ready' | 'error';

type Segment = { start: number; end: number | null };

type ListenState = {
  station: Station | null;
  status: ListenStatus;
  expanded: boolean;
  startedAt: number | null;
  open: (station: Station) => void;
  stop: () => void;
  expand: () => void;
  collapse: () => void;
  setStatus: (status: ListenStatus) => void;
  /** Seconds listened in the last 60 minutes, by this device's count. */
  usedSeconds: (now?: number) => number;
  /** The Listen page started or stopped playing; listening time counts only while it plays. */
  markPlaying: (playing: boolean) => void;
};

const ListenContext = createContext<ListenState | null>(null);

export const sessionText = (s: Station) => `${s.frequency} · ${facilityLabel(s.facility)} · ${s.name}`;

export function ListenProvider({ children }: { children: ReactNode }) {
  const { backgroundPlayback } = usePrefs();
  const [station, setStation] = useState<Station | null>(null);
  const [status, setStatus] = useState<ListenStatus>('idle');
  const [expanded, setExpanded] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const segments = useRef<Segment[]>([]);
  const askedForNotifications = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(USAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const cutoff = Date.now() - HOUR_MS;
        // A segment still open on disk was cut short by the app closing; it
        // ended no later than now, so count it closed at its start.
        segments.current = (JSON.parse(raw) as Segment[])
          .map((s) => ({ start: s.start, end: s.end ?? s.start }))
          .filter((s) => s.end > cutoff);
      })
      .catch(() => {});
  }, []);

  const persist = useCallback(() => {
    const cutoff = Date.now() - HOUR_MS;
    segments.current = segments.current.filter((s) => s.end === null || s.end > cutoff);
    AsyncStorage.setItem(USAGE_KEY, JSON.stringify(segments.current)).catch(() => {});
  }, []);

  const closeSegment = useCallback(() => {
    const open = segments.current.find((s) => s.end === null);
    if (open) open.end = Date.now();
    persist();
  }, [persist]);

  const stop = useCallback(() => {
    closeSegment();
    stopBackgroundSession();
    setStation(null);
    setStatus('idle');
    setExpanded(false);
    setStartedAt(null);
  }, [closeSegment]);

  const open = useCallback(
    (next: Station) => {
      closeSegment();
      const now = Date.now();
      setStation(next);
      setStatus('loading');
      setExpanded(true);
      setStartedAt(now);
    },
    [closeSegment],
  );

  const markPlaying = useCallback(
    (playing: boolean) => {
      const open = segments.current.some((s) => s.end === null);
      if (playing && !open) {
        segments.current.push({ start: Date.now(), end: null });
        persist();
      } else if (!playing && open) {
        closeSegment();
      }
    },
    [closeSegment, persist],
  );

  // The foreground service follows the session and the setting, so turning the
  // setting off mid session releases the locks straight away.
  const callsign = station?.callsign;
  useEffect(() => {
    if (!station || !backgroundPlayback) {
      stopBackgroundSession();
      return;
    }
    startBackgroundSession(station.callsign, sessionText(station));
    if (!askedForNotifications.current) {
      askedForNotifications.current = true;
      void requestNotificationPermission();
    }
    // Only a new station or a change of setting restarts the service.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callsign, backgroundPlayback]);

  useEffect(() => {
    const sub = addStopRequestListener(stop);
    return () => sub.remove();
  }, [stop]);

  const usedSeconds = useCallback((now = Date.now()) => {
    const from = now - HOUR_MS;
    let ms = 0;
    for (const s of segments.current) {
      const end = s.end ?? now;
      ms += Math.max(0, end - Math.max(s.start, from));
    }
    return Math.round(ms / 1000);
  }, []);

  const value = useMemo<ListenState>(
    () => ({
      station,
      status,
      expanded,
      startedAt,
      open,
      stop,
      expand: () => setExpanded(true),
      collapse: () => setExpanded(false),
      setStatus,
      usedSeconds,
      markPlaying,
    }),
    [station, status, expanded, startedAt, open, stop, usedSeconds, markPlaying],
  );

  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>;
}

export function useListen() {
  const ctx = useContext(ListenContext);
  if (!ctx) throw new Error('useListen must be used inside ListenProvider');
  return ctx;
}

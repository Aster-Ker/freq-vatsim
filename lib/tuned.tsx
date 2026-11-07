import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useFeed } from './feed';
import { useListen } from './listen';
import { fetchTuned, pilotsOn, type Pilot } from './vatsim';

/** Radios change rarely; once a minute keeps the list current at a few MB an hour. */
const POLL_MS = 60_000;

type TunedState = {
  /** Pilots with a radio on the playing station's frequency. */
  pilots: Pilot[];
  /** False until the transceivers feed has answered for this station. */
  known: boolean;
  /** Callsigns to look for in subtitles: tuned pilots, or every pilot online if the radio list is unavailable. */
  candidates: string[];
  pilot: (callsign: string) => Pilot | undefined;
};

const TunedContext = createContext<TunedState | null>(null);

/**
 * Who is listening on the playing frequency, from VATSIM's public
 * transceivers feed. Polled only while a station is playing and the app is
 * open; in the background the last list keeps serving the subtitles.
 */
export function TunedProvider({ children }: { children: ReactNode }) {
  const { station } = useListen();
  const { data } = useFeed();
  const [tuned, setTuned] = useState<Map<string, string[]> | null>(null);
  const frequency = station?.frequency;

  useEffect(() => {
    setTuned(null);
    if (!frequency) return;
    let ctrl: AbortController | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = () => {
      ctrl?.abort();
      ctrl = new AbortController();
      fetchTuned(ctrl.signal)
        .then(setTuned)
        .catch(() => {
          // Keep whatever list we had; subtitles fall back to every pilot online.
        });
    };
    const start = () => {
      load();
      timer = setInterval(load, POLL_MS);
    };
    const pause = () => {
      if (timer) clearInterval(timer);
      timer = null;
      ctrl?.abort();
    };
    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !timer) start();
      else if (s !== 'active') pause();
    });
    return () => {
      sub.remove();
      pause();
    };
  }, [frequency]);

  const value = useMemo<TunedState>(() => {
    const all = data?.pilots ?? new Map<string, Pilot>();
    const pilots = frequency && tuned ? pilotsOn(frequency, tuned, all) : [];
    const known = !!tuned;
    return {
      pilots,
      known,
      candidates: known ? pilots.map((p) => p.callsign) : [...all.keys()],
      pilot: (callsign) => all.get(callsign),
    };
  }, [data, tuned, frequency]);

  return <TunedContext.Provider value={value}>{children}</TunedContext.Provider>;
}

export function useTuned() {
  const ctx = useContext(TunedContext);
  if (!ctx) throw new Error('useTuned must be used inside TunedProvider');
  return ctx;
}

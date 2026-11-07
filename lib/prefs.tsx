import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTheme } from 'panelui-native/theme';

export type Appearance = 'dark' | 'light';

type Prefs = {
  saved: string[];
  backgroundPlayback: boolean;
  appearance: Appearance;
  /** Show subtitles while listening (needs the speech model). */
  subtitles: boolean;
};

const DEFAULTS: Prefs = { saved: [], backgroundPlayback: true, appearance: 'dark', subtitles: false };
const KEY = 'freq.prefs.v1';

type PrefsState = Prefs & {
  ready: boolean;
  isSaved: (callsign: string) => boolean;
  toggleSaved: (callsign: string) => void;
  setBackgroundPlayback: (on: boolean) => void;
  setAppearance: (a: Appearance) => void;
  setSubtitles: (on: boolean) => void;
};

const PrefsContext = createContext<PrefsState | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const { setTheme } = useTheme();

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    setTheme(prefs.appearance === 'dark' ? 'moon-dark' : 'moon');
  }, [prefs.appearance, setTheme]);

  const update = useCallback((patch: (p: Prefs) => Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch(prev) };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<PrefsState>(() => {
    const saved = new Set(prefs.saved);
    return {
      ...prefs,
      ready,
      isSaved: (c) => saved.has(c),
      toggleSaved: (c) =>
        update((p) => ({
          saved: p.saved.includes(c) ? p.saved.filter((x) => x !== c) : [...p.saved, c],
        })),
      setBackgroundPlayback: (on) => update(() => ({ backgroundPlayback: on })),
      setAppearance: (a) => update(() => ({ appearance: a })),
      setSubtitles: (on) => update(() => ({ subtitles: on })),
    };
  }, [prefs, ready, update]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}

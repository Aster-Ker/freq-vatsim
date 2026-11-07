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
import { Platform } from 'react-native';
import {
  captions as nativeCaptions,
  nativeAvailable,
  updateBackgroundSession,
} from '@/modules/freq-playback';
import { formatTransmission } from './atc-text';
import { matchCallsign, type CallsignMatch } from './callsigns';
import { demoCaptionSource } from './caption-demo';
import { sessionText, useListen } from './listen';
import { usePrefs } from './prefs';
import { useTuned } from './tuned';

/**
 * In-app subtitles.
 *
 * The Listen page's audio is tapped inside the WebView (lib/audio-tap.ts) and
 * fed to an on-device recognizer. Text comes back a phrase at a time: a
 * partial line that updates while someone talks, then a final line when they
 * stop. No audio or text leaves the phone.
 */

export type ModelState = 'unavailable' | 'missing' | 'downloading' | 'installed';
export type EngineState = 'idle' | 'starting' | 'ready' | 'error';
/** who: the callsign this transmission most likely belongs to, inferred from the words (lib/callsigns.ts). */
export type CaptionLine = { id: number; text: string; at: number; who: CallsignMatch | null };

type CaptionsState = {
  model: ModelState;
  /** 0 to 1 while downloading. */
  progress: number;
  downloadError: string | null;
  engine: EngineState;
  engineError: string | null;
  /** Subtitles are on for the current session. */
  active: boolean;
  lines: CaptionLine[];
  partial: string;
  /** The callsign in the phrase being spoken, once it has been said. */
  partialWho: CallsignMatch | null;
  download: () => Promise<void>;
  removeModel: () => void;
  /** PCM from the WebView tap; ignored unless subtitles are active. */
  feed: (pcmBase64: string) => void;
};

const MAX_LINES = 50;
const CaptionsContext = createContext<CaptionsState | null>(null);

// The web build is a design preview with no recognizer. It can be shown
// sample subtitles by setting window.__freqDemo before the app loads.
const source =
  Platform.OS === 'web' && typeof window !== 'undefined' && (window as { __freqDemo?: boolean }).__freqDemo
    ? demoCaptionSource
    : { available: nativeAvailable, ...nativeCaptions };

export function CaptionsProvider({ children }: { children: ReactNode }) {
  const { station } = useListen();
  const { subtitles, setSubtitles, backgroundPlayback } = usePrefs();
  const { candidates } = useTuned();
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  const [model, setModel] = useState<ModelState>(() =>
    !source.available ? 'unavailable' : source.isModelInstalled() ? 'installed' : 'missing',
  );
  const [progress, setProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineState>('idle');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [partial, setPartial] = useState('');
  const [partialWho, setPartialWho] = useState<CallsignMatch | null>(null);
  const seq = useRef(0);

  const active = subtitles && model === 'installed' && !!station;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const subs = [
      source.onCaption(({ text, final }) => {
        const who = text ? matchCallsign(text, candidatesRef.current) : null;
        if (!final) {
          setPartial(text ? formatTransmission(text) : '');
          setPartialWho(who);
          return;
        }
        setPartial('');
        setPartialWho(null);
        const line = { id: ++seq.current, text: formatTransmission(text), at: Date.now(), who };
        setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), line]);
      }),
      source.onState((e) => {
        setEngine(e.state === 'ready' ? 'ready' : 'error');
        setEngineError(e.state === 'ready' ? null : (e.message ?? 'Subtitles could not start.'));
      }),
      source.onModelProgress((e) => setProgress(e.total > 0 ? Math.min(1, e.received / e.total) : 0)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  // Start the recognizer only while it has something to listen to: it holds
  // about 70 MB of memory.
  useEffect(() => {
    if (active) {
      setEngine('starting');
      source.start();
    } else {
      source.stop();
      setEngine('idle');
      setPartial('');
      setPartialWho(null);
    }
  }, [active]);

  // A new station starts a clean transcript.
  const callsign = station?.callsign;
  useEffect(() => {
    source.flush();
    setLines([]);
    setPartial('');
    setPartialWho(null);
  }, [callsign]);

  // The latest line rides along in the notification, so it can be read from
  // the lock screen. When subtitles go off the notification goes back to the
  // station's details.
  const last = lines[lines.length - 1];
  useEffect(() => {
    if (!station || !backgroundPlayback) return;
    updateBackgroundSession(station.callsign, active && last ? last.text : sessionText(station));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id, active]);

  const feed = useCallback((pcm: string) => {
    if (activeRef.current) source.feed(pcm);
  }, []);

  const download = useCallback(async () => {
    setDownloadError(null);
    setProgress(0);
    setModel('downloading');
    try {
      await source.downloadModel();
      setModel('installed');
      setSubtitles(true);
    } catch (e) {
      setModel('missing');
      setDownloadError(
        e instanceof Error && e.message ? e.message : 'The subtitle model did not download. Try again.',
      );
    }
  }, [setSubtitles]);

  const removeModel = useCallback(() => {
    setSubtitles(false);
    source.deleteModel();
    setModel('missing');
  }, [setSubtitles]);

  const value = useMemo<CaptionsState>(
    () => ({
      model,
      progress,
      downloadError,
      engine,
      engineError,
      active,
      lines,
      partial,
      partialWho,
      download,
      removeModel,
      feed,
    }),
    [
      model,
      progress,
      downloadError,
      engine,
      engineError,
      active,
      lines,
      partial,
      partialWho,
      download,
      removeModel,
      feed,
    ],
  );

  return <CaptionsContext.Provider value={value}>{children}</CaptionsContext.Provider>;
}

export function useCaptions() {
  const ctx = useContext(CaptionsContext);
  if (!ctx) throw new Error('useCaptions must be used inside CaptionsProvider');
  return ctx;
}

/** How long a finished line still counts as "who is talking" after it ends. */
const SPEAKER_HOLD_MS = 4000;

/**
 * Who is talking right now, as far as the subtitles tell: the callsign in
 * the phrase being spoken, or in the line that just finished.
 */
export function currentSpeaker(c: Pick<CaptionsState, 'partialWho' | 'lines'>, now = Date.now()) {
  if (c.partialWho) return c.partialWho;
  const last = c.lines[c.lines.length - 1];
  return last && last.who && now - last.at < SPEAKER_HOLD_MS ? last.who : null;
}

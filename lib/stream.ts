import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { ListenStatus } from './listen';

/**
 * What the hidden Listen page is doing, as reported by the audio tap
 * (lib/audio-tap.ts), and what the player should show for it.
 *
 *  loading  the page is opening
 *  signin   the page has gone to VATSIM's sign in
 *  waiting  the page is up but nothing is playing yet (press play)
 *  live     the page is playing; the native player takes over
 *  stopped  it was playing and stopped (often the hourly limit)
 *  error    the page did not load
 */
export type StreamPhase = 'loading' | 'signin' | 'waiting' | 'live' | 'stopped' | 'error';

/** Loudness above this counts as someone transmitting. */
const TRANSMIT_LEVEL = 0.25;
/** A transmission is over once it has been quiet this long. */
const TRANSMIT_HOLD_MS = 1500;
const LISTEN_HOST = 'listen.vatsim.net';

export function useStream(
  callsign: string | undefined,
  status: ListenStatus,
  onPlayingChange?: (playing: boolean) => void,
) {
  const [playing, setPlaying] = useState(false);
  const [everPlayed, setEverPlayed] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const level = useSharedValue(0);
  const loudAt = useRef(0);
  const liveSince = useRef(0);

  // Each station starts from nothing.
  useEffect(() => {
    setPlaying(false);
    setEverPlayed(false);
    setReceiving(false);
    setHost(null);
    level.value = 0;
    loudAt.current = 0;
    liveSince.current = 0;
  }, [callsign, level]);

  // Receiving only re-renders on its edges, not on every level report.
  useEffect(() => {
    if (!receiving) return;
    const id = setInterval(() => {
      if (Date.now() - loudAt.current > TRANSMIT_HOLD_MS) setReceiving(false);
    }, 300);
    return () => clearInterval(id);
  }, [receiving]);

  const onState = useCallback(
    (isPlaying: boolean) => {
      setPlaying(isPlaying);
      onPlayingChange?.(isPlaying);
      if (isPlaying) {
        setEverPlayed(true);
        liveSince.current = liveSince.current || Date.now();
      } else {
        level.value = 0;
        setReceiving(false);
      }
    },
    [level, onPlayingChange],
  );

  const onLevel = useCallback(
    (v: number) => {
      level.value = v;
      if (v >= TRANSMIT_LEVEL) {
        loudAt.current = Date.now();
        setReceiving(true);
      }
    },
    [level],
  );

  const onUrl = useCallback((url: string) => {
    setHost(url.match(/^https?:\/\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? null);
  }, []);

  let phase: StreamPhase;
  if (status === 'error') phase = 'error';
  else if (host && host !== LISTEN_HOST && !host.startsWith('about')) phase = 'signin';
  else if (playing) phase = 'live';
  else if (status === 'loading' || status === 'idle') phase = 'loading';
  else if (everPlayed) phase = 'stopped';
  else phase = 'waiting';

  /** When the frequency last carried a transmission (or went live, if it has not yet). */
  const quietSince = () => loudAt.current || liveSince.current;

  return { phase, receiving, level, quietSince, onState, onLevel, onUrl };
}

export type Stream = ReturnType<typeof useStream>;

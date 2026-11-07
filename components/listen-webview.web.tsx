import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { View } from 'react-native';
import { T } from './type';
import type { ListenStatus } from '@/lib/listen';

export type ListenWebViewHandle = { reload: () => void };

type Props = {
  url: string;
  background: string;
  onStatus: (status: ListenStatus) => void;
  captionsOn: boolean;
  onPcm: (pcmBase64: string) => void;
  onPlaying: (playing: boolean) => void;
  onLevel: (level: number) => void;
  onUrl: (url: string) => void;
};

const demo = typeof window !== 'undefined' && !!(window as { __freqDemo?: boolean }).__freqDemo;

/**
 * The web build is a design preview only; Listen runs inside the Android app.
 * With window.__freqDemo set, it pretends a stream started playing and sends
 * a made up level pattern (a few seconds of talk, then a pause), so the native
 * player can be previewed.
 */
export const ListenWebView = forwardRef<ListenWebViewHandle, Props>(function ListenWebView(
  { onStatus, onPlaying, onLevel },
  ref,
) {
  useImperativeHandle(ref, () => ({ reload: () => {} }), []);
  useEffect(() => onStatus('ready'), [onStatus]);
  useEffect(() => {
    if (!demo) return;
    const start = setTimeout(() => onPlaying(true), 1200);
    let t = 0;
    const tick = setInterval(() => {
      t += 0.12;
      const talking = t % 7 < 3.5;
      onLevel(talking ? 0.45 + 0.35 * Math.abs(Math.sin(t * 7) * Math.sin(t * 2.3)) : 0.04 * Math.random());
    }, 120);
    return () => {
      clearTimeout(start);
      clearInterval(tick);
    };
  }, [onPlaying, onLevel]);
  return (
    <View className="flex-1 items-center justify-center gap-2 p-6">
      <T variant="title-3">VATSIM Listen plays here</T>
      <T variant="body-6" muted className="text-center">
        On Android this panel holds the Listen page for the station. Sign in once and the audio starts.
      </T>
    </View>
  );
});

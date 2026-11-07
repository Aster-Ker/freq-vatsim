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
};

/** The web build is a design preview only. Listen runs inside the Android app. */
export const ListenWebView = forwardRef<ListenWebViewHandle, Props>(function ListenWebView({ onStatus }, ref) {
  useImperativeHandle(ref, () => ({ reload: () => {} }), []);
  useEffect(() => onStatus('ready'), [onStatus]);
  return (
    <View className="flex-1 items-center justify-center gap-2 p-6">
      <T variant="title-3">VATSIM Listen plays here</T>
      <T variant="body-6" muted className="text-center">
        On Android this panel holds the Listen page for the station. Sign in once and the audio starts.
      </T>
    </View>
  );
});

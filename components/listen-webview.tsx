import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Linking } from 'react-native';
import { WebView as RNWebView, type WebViewNavigation } from 'react-native-webview';
import { AUDIO_TAP_SCRIPT, setCaptionsScript } from '@/lib/audio-tap';
import type { ListenStatus } from '@/lib/listen';

export type ListenWebViewHandle = { reload: () => void };

type Props = {
  url: string;
  background: string;
  onStatus: (status: ListenStatus) => void;
  /** Forward the page's audio for subtitles. */
  captionsOn: boolean;
  onPcm: (pcmBase64: string) => void;
  /** The page's playback started or stopped. */
  onPlaying: (playing: boolean) => void;
  /** Loudness, 0 to 1, several times a second while playing. */
  onLevel: (level: number) => void;
  /** The page navigated, for example to VATSIM's sign in. */
  onUrl: (url: string) => void;
};

// The package declares WebView<P = undefined> with props `WebViewProps & P`,
// which TypeScript 6 reduces to `never`. Pinning P to {} restores the props.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const WebView = RNWebView as unknown as typeof RNWebView<{}>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type WebViewInstance = RNWebView<{}>;

/** Pages the player may navigate to itself: Listen and the VATSIM sign in it sends you through. */
function isVatsimPage(url: string) {
  if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return true;
  const host = url.match(/^https:\/\/([^/?#]+)/i)?.[1]?.toLowerCase();
  return !!host && (host === 'vatsim.net' || host.endsWith('.vatsim.net'));
}

/**
 * VATSIM Listen, in place. Sign in cookies persist in the WebView's cookie
 * store, so the account step happens once. Anything that leaves vatsim.net
 * opens in the browser instead.
 */
export const ListenWebView = forwardRef<ListenWebViewHandle, Props>(function ListenWebView(
  { url, background, onStatus, captionsOn, onPcm, onPlaying, onLevel, onUrl },
  ref,
) {
  const webview = useRef<WebViewInstance>(null);
  useImperativeHandle(ref, () => ({ reload: () => webview.current?.reload() }), []);

  // The tap is installed on every page load but stays silent until told
  // otherwise, so this runs on each change and again after each load.
  const captionsRef = useRef(captionsOn);
  captionsRef.current = captionsOn;
  useEffect(() => {
    webview.current?.injectJavaScript(setCaptionsScript(captionsOn));
  }, [captionsOn]);

  const onNavigation = (req: WebViewNavigation) => {
    if (isVatsimPage(req.url)) return true;
    void Linking.openURL(req.url);
    return false;
  };

  return (
    <WebView
      ref={webview}
      source={{ uri: url }}
      style={{ flex: 1, backgroundColor: background }}
      originWhitelist={['https://*', 'about:*']}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      sharedCookiesEnabled
      // Lets Listen start the audio itself once the page is up.
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      // OAuth pop ups navigate in place rather than opening a second window
      // that the app has nowhere to show.
      setSupportMultipleWindows={false}
      // Listen only receives. Nothing here should ever be granted the microphone.
      mediaCapturePermissionGrantType="deny"
      onShouldStartLoadWithRequest={onNavigation}
      onLoadStart={() => {
        // A new page starts silent; its own tap reports when it plays.
        onPlaying(false);
        onStatus('loading');
      }}
      onNavigationStateChange={(e) => onUrl(e.url)}
      onLoadEnd={(e) => {
        if (!e.nativeEvent.loading) onStatus('ready');
        webview.current?.injectJavaScript(setCaptionsScript(captionsRef.current));
      }}
      // Installed before the page's own scripts, so it sees every sound the
      // page sets up. See lib/audio-tap.ts.
      injectedJavaScriptBeforeContentLoaded={AUDIO_TAP_SCRIPT}
      // Also in frames, in case the page plays from one.
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
      onMessage={(e) => {
        // Only the tap posts messages. A malformed one is dropped; the next
        // follows within a quarter second.
        let msg: { t?: string; d?: string; v?: number; playing?: boolean };
        try {
          msg = JSON.parse(e.nativeEvent.data);
        } catch {
          return;
        }
        if (msg.t === 'pcm' && typeof msg.d === 'string') onPcm(msg.d);
        else if (msg.t === 'lvl' && typeof msg.v === 'number') onLevel(msg.v);
        else if (msg.t === 'state') onPlaying(!!msg.playing);
      }}
      onError={() => onStatus('error')}
      onHttpError={(e) => {
        if (e.nativeEvent.statusCode >= 500) onStatus('error');
      }}
      webviewDebuggingEnabled={__DEV__}
    />
  );
});

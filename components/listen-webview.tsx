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
  { url, background, onStatus, captionsOn, onPcm },
  ref
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
      onLoadStart={() => onStatus('loading')}
      onLoadEnd={(e) => {
        if (!e.nativeEvent.loading) onStatus('ready');
        webview.current?.injectJavaScript(setCaptionsScript(captionsRef.current));
      }}
      // Installed before the page's own scripts, so it sees every sound the
      // page sets up. See lib/audio-tap.ts.
      injectedJavaScriptBeforeContentLoaded={AUDIO_TAP_SCRIPT}
      onMessage={(e) => {
        const data = e.nativeEvent.data;
        // Only the tap posts messages, and PCM is by far the most frequent.
        if (data.startsWith('{"t":"pcm"')) {
          try {
            onPcm((JSON.parse(data) as { d: string }).d);
          } catch {
            // A malformed message is dropped; the next chunk follows within a quarter second.
          }
        }
      }}
      onError={() => onStatus('error')}
      onHttpError={(e) => {
        if (e.nativeEvent.statusCode >= 500) onStatus('error');
      }}
      webviewDebuggingEnabled={__DEV__}
    />
  );
});

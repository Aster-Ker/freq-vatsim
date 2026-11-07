import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/**
 * Native side of Freq (Android only):
 *  - a foreground service that keeps a listening session alive with the
 *    screen off;
 *  - an on-device speech recognizer (Vosk) that turns the frequency into
 *    subtitles.
 *
 * The module is absent in Expo Go and on other platforms. Every call is then a
 * no-op and `nativeAvailable` is false, so the UI can say what needs the app
 * build.
 */
type CaptionEvent = { text: string; final: boolean };
type CaptionStateEvent = { state: 'ready' | 'error'; message?: string };
type ModelProgressEvent = { received: number; total: number };

type FreqPlaybackNative = {
  start(title: string, text: string): void;
  update(title: string, text: string): void;
  stop(): void;
  isRunning(): boolean;
  requestNotificationPermission(): Promise<boolean>;

  isCaptionModelInstalled(): boolean;
  captionModelSize(): number;
  downloadCaptionModel(): Promise<boolean>;
  deleteCaptionModel(): void;
  startCaptions(): void;
  feedCaptions(pcmBase64: string): void;
  flushCaptions(): void;
  stopCaptions(): void;

  addListener(event: 'onStopRequest', listener: () => void): EventSubscription;
  addListener(event: 'onCaption', listener: (e: CaptionEvent) => void): EventSubscription;
  addListener(event: 'onCaptionState', listener: (e: CaptionStateEvent) => void): EventSubscription;
  addListener(event: 'onModelProgress', listener: (e: ModelProgressEvent) => void): EventSubscription;
};

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<FreqPlaybackNative>('FreqPlayback') : null;

const noop = { remove() {} };

export const nativeAvailable = native != null;
export const backgroundPlaybackAvailable = nativeAvailable;

// Background session

export function startBackgroundSession(title: string, text: string) {
  native?.start(title, text);
}

export function updateBackgroundSession(title: string, text: string) {
  native?.update(title, text);
}

export function stopBackgroundSession() {
  native?.stop();
}

export function requestNotificationPermission(): Promise<boolean> {
  return native?.requestNotificationPermission() ?? Promise.resolve(false);
}

/** Fires when the person taps Stop in the notification or on the lock screen. */
export function addStopRequestListener(listener: () => void): { remove(): void } {
  return native?.addListener('onStopRequest', listener) ?? noop;
}

// Subtitles

/** The English model the recognizer downloads on first use. */
export const CAPTION_MODEL_DOWNLOAD_MB = 40;

export const captions = {
  isModelInstalled: () => native?.isCaptionModelInstalled() ?? false,
  modelSizeBytes: () => native?.captionModelSize() ?? 0,
  downloadModel: () =>
    native?.downloadCaptionModel() ?? Promise.reject(new Error('Subtitles need the installed app build.')),
  deleteModel: () => native?.deleteCaptionModel(),
  start: () => native?.startCaptions(),
  feed: (pcmBase64: string) => native?.feedCaptions(pcmBase64),
  flush: () => native?.flushCaptions(),
  stop: () => native?.stopCaptions(),
  onCaption: (l: (e: CaptionEvent) => void) => native?.addListener('onCaption', l) ?? noop,
  onState: (l: (e: CaptionStateEvent) => void) => native?.addListener('onCaptionState', l) ?? noop,
  onModelProgress: (l: (e: ModelProgressEvent) => void) => native?.addListener('onModelProgress', l) ?? noop,
};

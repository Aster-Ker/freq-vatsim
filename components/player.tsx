import { useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListenWebView, type ListenWebViewHandle } from './listen-webview';
import { AnimatedBadge } from 'panelui-native/components/animated-badge';
import { Alert } from 'panelui-native/components/alert';
import { Button } from 'panelui-native/components/button';
import { Meter } from 'panelui-native/components/meter';
import { ArrowClockwiseIcon, ArrowSquareOutIcon, CaretDownIcon, StopIcon, SubtitlesIcon } from './icons';
import { FacilityTag } from './station-row';
import { CaptionsPanel } from './captions-panel';
import { SubtitlesSheet } from './subtitles-sheet';
import { EASE_OUT, useTokens } from './tokens';
import { T } from './type';
import { backgroundPlaybackAvailable } from '@/modules/freq-playback';
import { useCaptions } from '@/lib/captions';
import { useFeed } from '@/lib/feed';
import { LISTEN_BUDGET_SECONDS, useListen, type ListenStatus } from '@/lib/listen';
import { usePrefs } from '@/lib/prefs';
import { facilityLabel, listenUrl } from '@/lib/vatsim';

const easing = Easing.bezier(...EASE_OUT);

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const STATUS_BADGE: Record<
  ListenStatus,
  { status: 'loading' | 'success' | 'danger' | 'neutral'; label: string }
> = {
  idle: { status: 'neutral', label: 'Idle' },
  loading: { status: 'loading', label: 'Connecting' },
  ready: { status: 'success', label: 'Listen open' },
  error: { status: 'danger', label: 'Not loaded' },
};

function useTick(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * The listening session. Mounted once at the root, above every screen, and
 * never unmounted while a station is playing: the WebView inside it carries
 * the audio, so minimising the player slides it off screen rather than
 * removing it.
 */
export function PlayerLayer() {
  const listen = useListen();
  const { station, status, expanded, collapse, expand, stop, setStatus, startedAt, usedSeconds } = listen;
  const { data } = useFeed();
  const { backgroundPlayback, subtitles, setSubtitles } = usePrefs();
  const captions = useCaptions();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const webview = useRef<ListenWebViewHandle>(null);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const now = useTick(!!station && expanded);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: reducedMotion ? 200 : 500,
      easing,
      reduceMotion: ReduceMotion.Never,
    });
  }, [expanded, reducedMotion, progress]);

  // Under reduced motion the panel fades in place instead of travelling.
  const panelStyle = useAnimatedStyle(() =>
    reducedMotion
      ? { opacity: progress.value, transform: [{ translateY: progress.value === 0 ? height : 0 }] }
      : { opacity: 1, transform: [{ translateY: (1 - progress.value) * height }] },
  );

  useEffect(() => {
    if (!expanded) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      collapse();
      return true;
    });
    return () => sub.remove();
  }, [expanded, collapse]);

  if (!station) return null;

  const url = listenUrl(station.callsign);
  const stillOnline = !data || data.stations.some((s) => s.callsign === station.callsign);
  const badge = stillOnline ? STATUS_BADGE[status] : { status: 'warning' as const, label: 'Station offline' };
  const used = usedSeconds(now);

  return (
    <>
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        style={[StyleSheet.absoluteFill, panelStyle]}
        className="bg-background"
      >
        <View
          className="flex-1 gap-4 px-4"
          style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
        >
          <View className="flex-row items-center justify-between">
            <Button variant="ghost" size="icon" onPress={collapse} accessibilityLabel="Minimise player">
              <CaretDownIcon size={24} color={tokens.foreground} />
            </Button>
            <T variant="title-4" muted>
              Now listening
            </T>
            <View className="flex-row">
              <Button
                variant={captions.active ? 'secondary' : 'ghost'}
                size="icon"
                // Once the model is on the phone this is a plain toggle; until
                // then it opens the setup sheet.
                onPress={() =>
                  captions.model === 'installed' ? setSubtitles(!subtitles) : setSubtitlesOpen(true)
                }
                onLongPress={() => setSubtitlesOpen(true)}
                accessibilityLabel={captions.active ? 'Turn subtitles off' : 'Subtitles'}
                accessibilityState={{ selected: captions.active }}
              >
                <SubtitlesIcon
                  size={22}
                  weight={captions.active ? 'fill' : 'regular'}
                  color={captions.active ? tokens.primary : tokens.foreground}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onPress={() => Linking.openURL(url)}
                accessibilityLabel="Open in browser"
              >
                <ArrowSquareOutIcon size={22} color={tokens.foreground} />
              </Button>
            </View>
          </View>

          <View className="flex-row items-center gap-3">
            <FacilityTag facility={station.facility} active />
            <View className="flex-1 gap-0.5">
              <T variant="heading-5" numberOfLines={1}>
                {station.callsign}
              </T>
              <T variant="body-6" muted numberOfLines={1}>
                {facilityLabel(station.facility)} · {station.name}
              </T>
            </View>
            <AnimatedBadge
              status={badge.status}
              pulse={status === 'ready' && stillOnline}
              contentKey={badge.label}
            >
              {badge.label}
            </AnimatedBadge>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 gap-1 rounded-xl border border-border bg-surface px-4 py-3">
              <T variant="caption-4" muted>
                Frequency
              </T>
              <T variant="readout-md">{station.frequency}</T>
            </View>
            <View className="flex-1 gap-1 rounded-xl border border-border bg-surface px-4 py-3">
              <T variant="caption-4" muted>
                Session
              </T>
              <T variant="readout-md">{clock(startedAt ? (now - startedAt) / 1000 : 0)}</T>
            </View>
          </View>

          <Meter
            value={Math.min(used, LISTEN_BUDGET_SECONDS)}
            maxValue={LISTEN_BUDGET_SECONDS}
            label="Listen allowance this hour"
            showValueLabel
            valueLabel={`${Math.min(15, Math.ceil(used / 60))} of 15 min`}
            thresholds={[
              { from: 0, color: 'success' },
              { from: LISTEN_BUDGET_SECONDS * 0.66, color: 'warning' },
              { from: LISTEN_BUDGET_SECONDS * 0.9, color: 'destructive' },
            ]}
          />

          <CaptionsPanel />

          <View className="flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
            <ListenWebView
              ref={webview}
              url={url}
              background={tokens.background}
              onStatus={setStatus}
              captionsOn={captions.active}
              onPcm={captions.feed}
            />
            {status === 'error' ? (
              <View className="absolute inset-x-0 bottom-0 p-2">
                <Alert variant="destructive">
                  <Alert.Content>
                    <Alert.Title>Listen did not load</Alert.Title>
                    <Alert.Description>Check your connection, then reload the page.</Alert.Description>
                  </Alert.Content>
                </Alert>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onPress={() => webview.current?.reload()}
                  startContent={<ArrowClockwiseIcon size={16} color={tokens.foreground} />}
                >
                  Reload
                </Button>
              </View>
            ) : null}
          </View>

          {/* The subtitles panel needs the room more than this note does. */}
          {captions.active ? null : (
            <T variant="caption-5" muted className="text-center">
              {!backgroundPlaybackAvailable
                ? 'Audio stops when the screen locks in this preview build. Install the app build to keep listening.'
                : backgroundPlayback
                  ? 'Keeps playing with the screen off. Sign in with your VATSIM account the first time.'
                  : 'Background listening is off in Settings, so audio may stop when the screen locks.'}
            </T>
          )}

          <Button
            variant="secondary"
            size="lg"
            onPress={stop}
            startContent={<StopIcon size={20} weight="fill" color={tokens.foreground} />}
          >
            Stop listening
          </Button>
        </View>
      </Animated.View>

      {!expanded ? <MiniPlayer onExpand={expand} /> : null}
      <SubtitlesSheet open={subtitlesOpen} onOpenChange={setSubtitlesOpen} />
    </>
  );
}

const enter = FadeInDown.duration(500).easing(easing);
const exit = FadeOutDown.duration(300).easing(easing);

function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const { station, status, stop } = useListen();
  const { active, lines, partial } = useCaptions();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  if (!station) return null;
  const badge = STATUS_BADGE[status];
  // With subtitles on, the second line follows the frequency as text.
  const lastLine = lines[lines.length - 1];
  const caption = active
    ? partial || (lastLine && Date.now() - lastLine.at < 30_000 ? lastLine.text : '')
    : '';

  return (
    <Animated.View
      entering={enter}
      exiting={exit}
      className="absolute inset-x-4"
      style={{ bottom: insets.bottom + 12 }}
    >
      <View className="flex-row items-center gap-1 rounded-2xl border border-border bg-overlay p-2 shadow-lg">
        {/* Two siblings rather than a button inside a button, so each is its own target for touch and screen readers. */}
        <Pressable
          onPress={onExpand}
          accessibilityRole="button"
          accessibilityLabel={`Open player, ${station.callsign}, ${badge.label}`}
          className="flex-1 flex-row items-center gap-3 active:opacity-80"
        >
          <FacilityTag facility={station.facility} active />
          <View className="flex-1 gap-0.5">
            <T variant="title-4" numberOfLines={1}>
              {station.callsign}
            </T>
            {caption ? (
              <T variant="caption-5" muted numberOfLines={1}>
                {caption}
              </T>
            ) : (
              <View className="flex-row items-center gap-2">
                <T variant="readout-xs" muted>
                  {station.frequency}
                </T>
                <T variant="caption-5" muted>
                  {badge.label}
                </T>
              </View>
            )}
          </View>
        </Pressable>
        <Button variant="ghost" size="icon" onPress={stop} accessibilityLabel="Stop listening">
          <StopIcon size={22} weight="fill" color={tokens.foreground} />
        </Button>
      </View>
    </Animated.View>
  );
}

/** Space for screens to leave under their content so the mini player never covers the last row. */
export const MINI_PLAYER_CLEARANCE = 96;

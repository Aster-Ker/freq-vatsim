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
import { AnimatedBadge } from 'panelui-native/components/animated-badge';
import { Alert } from 'panelui-native/components/alert';
import { Button } from 'panelui-native/components/button';
import { ArrowClockwiseIcon, ArrowSquareOutIcon, CaretDownIcon, StopIcon, SubtitlesIcon } from './icons';
import { ListenWebView, type ListenWebViewHandle } from './listen-webview';
import { LiveStage } from './live-stage';
import { speakerText } from './speaker';
import { FacilityTag } from './station-row';
import { SubtitlesSheet } from './subtitles-sheet';
import { EASE_OUT, useTokens } from './tokens';
import { T } from './type';
import { backgroundPlaybackAvailable } from '@/modules/freq-playback';
import { currentSpeaker, useCaptions } from '@/lib/captions';
import { useFeed } from '@/lib/feed';
import { useListen } from '@/lib/listen';
import { usePrefs } from '@/lib/prefs';
import { useStream, type Stream, type StreamPhase } from '@/lib/stream';
import { useTuned } from '@/lib/tuned';
import { facilityLabel, listenUrl } from '@/lib/vatsim';

const easing = Easing.bezier(...EASE_OUT);

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

type BadgeStatus = 'loading' | 'success' | 'danger' | 'neutral' | 'warning' | 'info';

function badgeFor(phase: StreamPhase): { status: BadgeStatus; label: string } {
  switch (phase) {
    case 'loading':
      return { status: 'loading', label: 'Connecting' };
    case 'signin':
      return { status: 'info', label: 'Sign in' };
    case 'waiting':
      return { status: 'neutral', label: 'Press play' };
    case 'live':
      // Steady green while connected, whether anyone is talking or not. The
      // badge pulses during a transmission.
      return { status: 'success', label: 'Online' };
    case 'stopped':
      return { status: 'warning', label: 'Stopped' };
    case 'error':
      return { status: 'danger', label: 'Not loaded' };
  }
}

/** Why the Listen page is on screen, in one line, and the way back when there is one. */
function PageBanner({ phase, onBack }: { phase: StreamPhase; onBack: () => void }) {
  const text: Record<StreamPhase, string> = {
    loading: 'Opening VATSIM Listen.',
    signin: 'Sign in with your VATSIM account. Freq switches to its own player once the audio starts.',
    waiting: 'Press play on the Listen page. Freq switches to its own player once the audio starts.',
    stopped: 'Listen stopped playing. If VATSIM has limited your listening time, the page below says so.',
    live: 'This is the Listen page. The audio keeps playing.',
    error: 'The Listen page did not load.',
  };
  return (
    <View className="flex-row items-center gap-3 border-b border-border bg-surface px-3 py-2">
      <T variant="caption-5" muted className="flex-1">
        {text[phase]}
      </T>
      {phase === 'live' ? (
        <Button size="xs" variant="secondary" onPress={onBack}>
          Back to player
        </Button>
      ) : null}
    </View>
  );
}

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
 *
 * The VATSIM Listen page only shows while it needs you: to sign in, to press
 * play, or when it has stopped. Once it is playing, the player's own screen
 * (LiveStage) covers it and the page keeps running underneath.
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
  const [showPage, setShowPage] = useState(false);
  const stream = useStream(station?.callsign, status, listen.markPlaying);
  const now = useTick(!!station && expanded);

  useEffect(() => setShowPage(false), [station?.callsign]);

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
      if (showPage) setShowPage(false);
      else collapse();
      return true;
    });
    return () => sub.remove();
  }, [expanded, collapse, showPage]);

  if (!station) return null;

  const url = listenUrl(station.callsign);
  const stillOnline = !data || data.stations.some((s) => s.callsign === station.callsign);
  const badge = stillOnline
    ? badgeFor(stream.phase)
    : { status: 'warning' as const, label: 'Station offline' };
  const used = usedSeconds(now);
  const native = stream.phase === 'live' && !showPage;

  const toggleSubtitles = () =>
    captions.model === 'installed' ? setSubtitles(!subtitles) : setSubtitlesOpen(true);

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
            <View className="items-center">
              <T variant="title-5" muted>
                Now listening
              </T>
              <T variant="readout-xs" muted accessibilityLabel="Session length">
                {clock(startedAt ? (now - startedAt) / 1000 : 0)}
              </T>
            </View>
            <View className="flex-row">
              <Button
                variant={captions.active ? 'secondary' : 'ghost'}
                size="icon"
                // Once the model is on the phone this is a plain toggle; until
                // then it opens the setup sheet.
                onPress={toggleSubtitles}
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
              pulse={stream.phase === 'live' && stream.receiving && stillOnline}
              contentKey={badge.label}
            >
              {badge.label}
            </AnimatedBadge>
          </View>

          {/* Time actually playing in the last hour, by this phone's count.
              VATSIM decides any limit and the Listen page says when one applies. */}
          <View className="flex-row items-center justify-between">
            <T variant="caption-4" muted>
              Listened in the last hour
            </T>
            <T variant="readout-xs" muted>
              {used < 60 ? 'under 1 min' : `${Math.floor(used / 60)} min`}
            </T>
          </View>

          <View className="flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
            {native ? null : <PageBanner phase={stream.phase} onBack={() => setShowPage(false)} />}
            {/* The page stays mounted in the same place whichever view is on
                top, so switching never reloads it or interrupts the audio. */}
            <View className="flex-1">
              <ListenWebView
                ref={webview}
                url={url}
                background={tokens.background}
                onStatus={setStatus}
                captionsOn={captions.active}
                onPcm={captions.feed}
                onPlaying={stream.onState}
                onLevel={stream.onLevel}
                onUrl={stream.onUrl}
              />
            </View>
            {native ? (
              <LiveStage
                stream={stream}
                now={now}
                frequency={station.frequency}
                onShowPage={() => setShowPage(true)}
                onSubtitles={toggleSubtitles}
              />
            ) : null}
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

          {!backgroundPlaybackAvailable || !backgroundPlayback ? (
            <T variant="caption-5" muted className="text-center">
              {!backgroundPlaybackAvailable
                ? 'Audio stops when the screen locks in this preview build. Install the app build to keep listening.'
                : 'Background listening is off in Settings, so audio may stop when the screen locks.'}
            </T>
          ) : null}

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

      {!expanded ? <MiniPlayer stream={stream} onExpand={expand} /> : null}
      <SubtitlesSheet open={subtitlesOpen} onOpenChange={setSubtitlesOpen} />
    </>
  );
}

const enter = FadeInDown.duration(500).easing(easing);
const exit = FadeOutDown.duration(300).easing(easing);

function MiniPlayer({ stream, onExpand }: { stream: Stream; onExpand: () => void }) {
  const { station, stop } = useListen();
  const captions = useCaptions();
  const { active, lines, partial } = captions;
  const tuned = useTuned();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  if (!station) return null;
  const badge = badgeFor(stream.phase);
  const match = stream.phase === 'live' && stream.receiving ? currentSpeaker(captions) : null;
  // The station's own callsign is already the title, so a controller call shows who it is calling.
  const talking = match
    ? match.role === 'atc'
      ? `→ ${match.callsign}`
      : speakerText(match, station.callsign, tuned.pilot).who
    : null;
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
            {talking || caption ? (
              <View className="flex-row items-center gap-2">
                {talking ? (
                  <T variant="readout-xs" className="text-primary">
                    {talking}
                  </T>
                ) : null}
                <T variant="caption-5" muted numberOfLines={1} className="flex-1">
                  {caption || 'talking'}
                </T>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <T variant="readout-xs" muted>
                  {station.frequency}
                </T>
                <T
                  variant="caption-5"
                  muted={!(stream.phase === 'live' && stream.receiving)}
                  className={stream.phase === 'live' && stream.receiving ? 'text-primary' : undefined}
                >
                  {stream.phase === 'live' && stream.receiving ? 'Receiving' : badge.label}
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

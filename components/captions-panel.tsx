import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { Button } from 'panelui-native/components/button';
import { XIcon } from './icons';
import { EASE_OUT, useTokens } from './tokens';
import { T } from './type';
import { useCaptions } from '@/lib/captions';
import { usePrefs } from '@/lib/prefs';

const arrive = FadeIn.duration(300).easing(Easing.bezier(...EASE_OUT));

const clockTime = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * The running transcript, newest at the bottom. The phrase being spoken shows
 * muted under the last finished line and settles into place when it ends.
 */
/** fill: stretch to the space available instead of a fixed five line window. */
export function CaptionsPanel({ fill = false }: { fill?: boolean }) {
  const { active, engine, engineError, lines, partial } = useCaptions();
  const { setSubtitles } = usePrefs();
  const tokens = useTokens();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [lines.length, partial]);

  if (!active) return null;

  const status =
    engine === 'starting' ? 'Starting' : engine === 'error' ? (engineError ?? 'Stopped') : 'On this phone';

  return (
    <View
      className={
        fill
          ? 'flex-1 gap-2 rounded-xl border border-border bg-surface p-3'
          : 'gap-2 rounded-xl border border-border bg-surface p-3'
      }
    >
      <View className="flex-row items-center gap-2">
        <T variant="title-5">Subtitles</T>
        <T
          variant="caption-5"
          muted={engine !== 'error'}
          className={engine === 'error' ? 'flex-1 text-destructive-foreground' : 'flex-1'}
          numberOfLines={1}
        >
          {status}
        </T>
        <Button
          variant="ghost"
          size="xs"
          onPress={() => setSubtitles(false)}
          accessibilityLabel="Turn subtitles off"
        >
          <XIcon size={14} color={tokens.muted} />
        </Button>
      </View>

      <ScrollView
        ref={scroll}
        style={fill ? { flex: 1 } : { height: 112 }}
        contentContainerClassName="gap-2 pb-1"
        accessibilityLiveRegion="polite"
        accessibilityLabel="Subtitles"
      >
        {lines.length === 0 && !partial ? (
          <T variant="body-6" muted>
            Text appears here as each transmission ends.
          </T>
        ) : null}
        {lines.map((line) => (
          <Animated.View key={line.id} entering={arrive} className="flex-row gap-3">
            <T variant="readout-xs" muted className="pt-0.5">
              {clockTime(line.at)}
            </T>
            <T variant="body-6" className="flex-1" selectable>
              {line.text}
            </T>
          </Animated.View>
        ))}
        {partial ? (
          <View className="flex-row gap-3">
            <T variant="readout-xs" muted className="pt-0.5">
              {clockTime(Date.now())}
            </T>
            <T variant="body-6" muted className="flex-1">
              {partial}
            </T>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

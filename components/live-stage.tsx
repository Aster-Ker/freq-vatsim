import { View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { Button } from 'panelui-native/components/button';
import { Soundwave } from 'panelui-native/components/soundwave';
import { CaptionsPanel } from './captions-panel';
import { BrowserIcon, SubtitlesIcon } from './icons';
import { EASE_OUT, useTokens } from './tokens';
import { T } from './type';
import { useCaptions } from '@/lib/captions';
import type { Stream } from '@/lib/stream';

const arrive = FadeIn.duration(300).easing(Easing.bezier(...EASE_OUT));

type Props = {
  stream: Stream;
  now: number;
  frequency: string;
  onShowPage: () => void;
  onSubtitles: () => void;
};

function quietLabel(ms: number) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Waiting for the next transmission';
  return `Quiet for ${min} min`;
}

/**
 * The player's own screen, shown over the Listen page once it is playing:
 * the frequency, a meter driven by the real audio level, and the subtitles.
 * The page keeps running underneath and carries the sound.
 */
export function LiveStage({ stream, now, frequency, onShowPage, onSubtitles }: Props) {
  const tokens = useTokens();
  const captions = useCaptions();
  const since = stream.quietSince();

  return (
    <Animated.View entering={arrive} className="absolute inset-0 gap-3 bg-surface p-3">
      <View className="items-center gap-2 rounded-xl border border-border bg-background px-4 pb-4 pt-5">
        <T variant="readout-lg" accessibilityLabel={`Frequency ${frequency}`}>
          {frequency}
        </T>
        <Soundwave
          variant="bars"
          mode="scrolling"
          centered
          fadeEdges
          level={stream.level}
          state={stream.receiving ? 'speaking' : 'listening'}
          height={56}
          bars={36}
          color={stream.receiving ? '--color-primary' : '--color-muted-foreground'}
          className="w-full"
        />
        <View className="items-center gap-0.5" accessibilityLiveRegion="polite">
          <T variant="title-3">{stream.receiving ? 'Receiving' : 'On frequency'}</T>
          <T variant="caption-5" muted>
            {stream.receiving ? 'Someone is transmitting' : quietLabel(since ? now - since : 0)}
          </T>
        </View>
      </View>

      {captions.active ? (
        <CaptionsPanel fill />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 rounded-xl border border-border px-6">
          <T variant="body-6" muted className="text-center">
            Turn on subtitles to read each transmission here as it ends.
          </T>
          <Button
            variant="outline"
            size="sm"
            onPress={onSubtitles}
            startContent={<SubtitlesIcon size={16} color={tokens.foreground} />}
          >
            Turn on subtitles
          </Button>
        </View>
      )}

      <Button
        variant="ghost"
        size="sm"
        onPress={onShowPage}
        startContent={<BrowserIcon size={16} color={tokens.muted} />}
        labelClassName="text-muted-foreground"
      >
        Show Listen page
      </Button>
    </Animated.View>
  );
}

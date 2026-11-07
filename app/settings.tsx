import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from 'panelui-native/components/button';
import { Separator } from 'panelui-native/components/separator';
import { Switch } from 'panelui-native/components/switch';
import { Tabs } from 'panelui-native/components/tabs';
import { ArrowSquareOutIcon, CaretLeftIcon, SubtitlesIcon } from '@/components/icons';
import { MINI_PLAYER_CLEARANCE } from '@/components/player';
import { SubtitlesSheet } from '@/components/subtitles-sheet';
import { useTokens } from '@/components/tokens';
import { T } from '@/components/type';
import {
  backgroundPlaybackAvailable,
  CAPTION_MODEL_DOWNLOAD_MB,
  captions as nativeCaptions,
} from '@/modules/freq-playback';
import { useCaptions } from '@/lib/captions';
import { useListen } from '@/lib/listen';
import { usePrefs, type Appearance } from '@/lib/prefs';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <T variant="caption-4" muted className="px-1">
        {title}
      </T>
      <View className="gap-4 rounded-2xl border border-border bg-surface p-4">{children}</View>
    </View>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tokens = useTokens();
  const prefs = usePrefs();
  const { station } = useListen();
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const captions = useCaptions();
  // Read on each render: the model changes size only when it is installed or removed.
  const modelMb =
    captions.model === 'installed' ? Math.round(nativeCaptions.modelSizeBytes() / 1_000_000) : 0;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4"
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + (station ? MINI_PLAYER_CLEARANCE : 24),
      }}
    >
      <View className="flex-row items-center gap-2">
        <Button variant="ghost" size="icon" onPress={() => router.back()} accessibilityLabel="Back">
          <CaretLeftIcon size={24} color={tokens.foreground} />
        </Button>
        <T variant="heading-5">Settings</T>
      </View>

      <Section title="Listening">
        <View className="flex-row items-center gap-4">
          <View className="flex-1 gap-1">
            <T variant="title-3">Keep listening with the screen off</T>
            <T variant="body-6" muted>
              {backgroundPlaybackAvailable
                ? 'Holds the frequency open while you use other apps or lock the phone, with a Stop control in the notification.'
                : 'Needs the installed app build. Expo Go cannot run the background service, so audio stops when the screen locks.'}
            </T>
          </View>
          <Switch
            value={prefs.backgroundPlayback && backgroundPlaybackAvailable}
            onValueChange={prefs.setBackgroundPlayback}
            disabled={!backgroundPlaybackAvailable}
            label="Keep listening with the screen off"
          />
        </View>
      </Section>

      <Section title="Subtitles">
        <View className="flex-row items-center gap-4">
          <View className="flex-1 gap-1">
            <T variant="title-3">Show subtitles while listening</T>
            <T variant="body-6" muted>
              Turns each transmission into text on this phone. No audio or text is recorded or sent anywhere.
            </T>
          </View>
          <Switch
            value={prefs.subtitles && captions.model === 'installed'}
            onValueChange={(on) =>
              captions.model === 'installed' ? prefs.setSubtitles(on) : setSubtitlesOpen(true)
            }
            disabled={captions.model === 'unavailable'}
            label="Show subtitles while listening"
          />
        </View>
        <Separator />
        <View className="flex-row items-center gap-4">
          <View className="flex-1 gap-1">
            <T variant="title-4">Speech model</T>
            <T variant="caption-5" muted>
              {captions.model === 'installed'
                ? `English, on this phone${modelMb ? ` · ${modelMb} MB` : ''}`
                : captions.model === 'downloading'
                  ? `Downloading · ${Math.round(captions.progress * CAPTION_MODEL_DOWNLOAD_MB)} of ${CAPTION_MODEL_DOWNLOAD_MB} MB`
                  : captions.model === 'unavailable'
                    ? 'Needs the installed app build'
                    : `Not downloaded · ${CAPTION_MODEL_DOWNLOAD_MB} MB, once`}
            </T>
          </View>
          {captions.model === 'installed' ? (
            <Button variant="ghost" size="sm" onPress={captions.removeModel}>
              Remove
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={captions.model !== 'missing'}
              onPress={() => setSubtitlesOpen(true)}
              startContent={<SubtitlesIcon size={16} color={tokens.foreground} />}
            >
              Set up
            </Button>
          )}
        </View>
      </Section>

      <Section title="Appearance">
        <Tabs
          variant="segmented"
          value={prefs.appearance}
          defaultValue="dark"
          onValueChange={(v) => prefs.setAppearance(v as Appearance)}
        >
          <Tabs.List>
            <Tabs.Trigger value="dark">Dark</Tabs.Trigger>
            <Tabs.Trigger value="light">Light</Tabs.Trigger>
          </Tabs.List>
        </Tabs>
      </Section>

      <Section title="Where the audio comes from">
        <T variant="body-6" muted>
          Audio plays through VATSIM Listen, the network's own listening service. You sign in with your VATSIM
          account the first time. VATSIM can limit how long each person listens per hour and how many people
          listen at once, and changes those limits as it needs to. When one applies, the Listen page tells
          you.
        </T>
        <T variant="body-6" muted>
          The station list comes from the public VATSIM data feed and refreshes every 30 seconds while the app
          is open.
        </T>
        <View className="gap-2">
          <Button
            variant="outline"
            onPress={() => Linking.openURL('https://listen.vatsim.net')}
            endContent={<ArrowSquareOutIcon size={18} color={tokens.foreground} />}
          >
            Open VATSIM Listen
          </Button>
          <Button
            variant="ghost"
            onPress={() => Linking.openURL('https://vatsim.net')}
            endContent={<ArrowSquareOutIcon size={18} color={tokens.foreground} />}
          >
            Get a VATSIM account
          </Button>
        </View>
      </Section>

      <T variant="caption-5" muted className="text-center">
        Freq {Constants.expoConfig?.version ?? ''} · Not affiliated with VATSIM
      </T>

      <SubtitlesSheet open={subtitlesOpen} onOpenChange={setSubtitlesOpen} />
    </ScrollView>
  );
}

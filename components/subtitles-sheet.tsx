import { View } from 'react-native';
import { Alert } from 'panelui-native/components/alert';
import { BottomSheet } from 'panelui-native/components/bottom-sheet';
import { Button } from 'panelui-native/components/button';
import { Progress } from 'panelui-native/components/progress';
import { DownloadSimpleIcon, SubtitlesIcon } from './icons';
import { useTokens } from './tokens';
import { T } from './type';
import { CAPTION_MODEL_DOWNLOAD_MB } from '@/modules/freq-playback';
import { useCaptions } from '@/lib/captions';
import { usePrefs } from '@/lib/prefs';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

function Point({ title, body }: { title: string; body: string }) {
  return (
    <View className="flex-1 gap-1 rounded-xl border border-border bg-surface px-3 py-3">
      <T variant="title-5">{title}</T>
      <T variant="caption-5" muted>
        {body}
      </T>
    </View>
  );
}

/**
 * Setting up subtitles: what they are, the one time model download, and the
 * switch. Opened from the player's subtitles button and from Settings.
 */
export function SubtitlesSheet({ open, onOpenChange }: Props) {
  const tokens = useTokens();
  const { model, progress, downloadError, download } = useCaptions();
  const { subtitles, setSubtitles } = usePrefs();

  const received = Math.round(progress * CAPTION_MODEL_DOWNLOAD_MB);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheet.Content size="auto">
        <BottomSheet.Header
          title="Subtitles"
          description="Freq turns the frequency into text as each transmission ends. It all happens on this phone: no audio or text is recorded or sent anywhere."
        />
        <BottomSheet.Body>
          <View className="flex-row gap-2 py-2">
            <Point title="Private" body="Speech recognition runs on the phone" />
            <Point title="Offline" body={`One ${CAPTION_MODEL_DOWNLOAD_MB} MB download, then no data`} />
            <Point title="English" body="Tuned for general speech" />
          </View>

          <T variant="body-6" muted className="py-2">
            Callsigns, accents and a busy frequency will trip it up now and then. Numbers are written the way a
            controller says them, so a heading reads 270 and a frequency 118.5. Use the text as a guide, never as
            a clearance.
          </T>

          {model === 'downloading' ? (
            <View className="gap-2 py-2">
              <Progress value={progress * 100} />
              <T variant="caption-5" muted>
                Downloading the speech model · {received} of {CAPTION_MODEL_DOWNLOAD_MB} MB
              </T>
            </View>
          ) : null}

          {downloadError ? (
            <Alert variant="destructive" className="my-2">
              <Alert.Content>
                <Alert.Title>Download did not finish</Alert.Title>
                <Alert.Description>{downloadError}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          {model === 'unavailable' ? (
            <Alert className="my-2">
              <Alert.Content>
                <Alert.Title>Needs the installed app</Alert.Title>
                <Alert.Description>
                  Subtitles run in the Android app build. Expo Go and the web preview cannot load the speech
                  engine.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
        </BottomSheet.Body>

        <BottomSheet.Footer className="pb-2">
          {model === 'installed' ? (
            <Button
              size="lg"
              variant={subtitles ? 'secondary' : 'primary'}
              onPress={() => {
                setSubtitles(!subtitles);
                onOpenChange(false);
              }}
              startContent={
                <SubtitlesIcon size={20} weight="bold" color={subtitles ? tokens.foreground : tokens.primaryForeground} />
              }
            >
              {subtitles ? 'Turn subtitles off' : 'Turn subtitles on'}
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={model !== 'missing'}
              loading={model === 'downloading'}
              onPress={download}
              startContent={<DownloadSimpleIcon size={20} weight="bold" color={tokens.primaryForeground} />}
            >
              {`Download ${CAPTION_MODEL_DOWNLOAD_MB} MB and turn on`}
            </Button>
          )}
        </BottomSheet.Footer>
      </BottomSheet.Content>
    </BottomSheet>
  );
}

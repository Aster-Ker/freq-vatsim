import { View } from 'react-native';
import { BottomSheet } from 'panelui-native/components/bottom-sheet';
import { Button } from 'panelui-native/components/button';
import { Separator } from 'panelui-native/components/separator';
import { HeadphonesIcon, StarIcon, StopIcon } from './icons';
import { FacilityTag } from './station-row';
import { useTokens } from './tokens';
import { T } from './type';
import { facilityLabel, onlineFor, type Station } from '@/lib/vatsim';

type Props = {
  station: Station | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saved: boolean;
  playing: boolean;
  onToggleSaved: () => void;
  onListen: () => void;
  onStop: () => void;
};

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-1 gap-1">
      <T variant="caption-4" muted>
        {label}
      </T>
      <T variant={mono ? 'readout-sm' : 'body-5'} numberOfLines={2}>
        {value}
      </T>
    </View>
  );
}

export function StationSheet({ station, open, onOpenChange, saved, playing, onToggleSaved, onListen, onStop }: Props) {
  const { foreground, primaryForeground, warning } = useTokens();
  if (!station) return null;

  const infoTitle = station.facility === 'ATIS' ? `Information ${station.atisCode ?? ''}`.trim() : 'Controller info';

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheet.Content size="auto">
        <View className="flex-row items-center gap-3 pb-4 pt-2">
          <FacilityTag facility={station.facility} active={playing} />
          <View className="flex-1 gap-0.5">
            <T variant="heading-6" numberOfLines={1}>
              {station.callsign}
            </T>
            <T variant="body-6" muted numberOfLines={1}>
              {facilityLabel(station.facility)} · {station.name}
            </T>
          </View>
        </View>

        <BottomSheet.Body>
          <View className="items-start gap-1 rounded-xl border border-border bg-surface px-4 py-3">
            <T variant="caption-4" muted>
              Frequency
            </T>
            <T variant="readout-lg">{station.frequency}</T>
          </View>

          <View className="flex-row gap-4 py-4">
            <Fact label="Rating" value={station.ratingLong || station.rating || 'Not listed'} />
            <Fact label="Online for" value={onlineFor(station.logonTime)} mono />
            <Fact label="CID" value={String(station.cid)} mono />
          </View>

          {station.info.length > 0 ? (
            <>
              <Separator />
              <View className="gap-2 py-4">
                <T variant="title-4">{infoTitle}</T>
                <T variant="body-6" muted selectable>
                  {station.info.join('\n')}
                </T>
              </View>
            </>
          ) : null}
        </BottomSheet.Body>

        <BottomSheet.Footer className="flex-row pb-2">
          <Button
            variant="outline"
            size="lg"
            onPress={onToggleSaved}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save station'}
            startContent={<StarIcon size={20} weight={saved ? 'fill' : 'regular'} color={saved ? warning : foreground} />}
          >
            {saved ? 'Saved' : 'Save'}
          </Button>
          {playing ? (
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onPress={onStop}
              startContent={<StopIcon size={20} weight="fill" color={foreground} />}
            >
              Stop listening
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              onPress={onListen}
              startContent={<HeadphonesIcon size={20} weight="bold" color={primaryForeground} />}
            >
              Listen live
            </Button>
          )}
        </BottomSheet.Footer>
      </BottomSheet.Content>
    </BottomSheet>
  );
}

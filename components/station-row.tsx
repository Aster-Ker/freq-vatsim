import { memo } from 'react';
import { View } from 'react-native';
import { Item } from 'panelui-native/components/item';
import { AnimatedBadge } from 'panelui-native/components/animated-badge';
import { Skeleton } from 'panelui-native/components/skeleton';
import { StarIcon } from './icons';
import { useTokens } from './tokens';
import { T } from './type';
import { onlineFor, type Station } from '@/lib/vatsim';

/** The facility, as a fixed width code block. Sized to the row's 12px radius minus its 8px inset. */
export function FacilityTag({ facility, active }: { facility: string; active?: boolean }) {
  return (
    <View
      className={
        active
          ? 'h-12 w-12 items-center justify-center rounded-md bg-primary'
          : 'h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-secondary'
      }
    >
      <T variant="readout-xs" className={active ? 'text-primary-foreground' : 'text-foreground'}>
        {facility}
      </T>
    </View>
  );
}

type Props = {
  station: Station;
  saved: boolean;
  playing: boolean;
  now: number;
  onPress: (s: Station) => void;
};

export const StationRow = memo(function StationRow({ station, saved, playing, now, onPress }: Props) {
  const { warning } = useTokens();
  const detail = [station.name, station.rating, onlineFor(station.logonTime, now)].filter(Boolean).join(' · ');

  return (
    <Item
      size="sm"
      className="gap-3 px-2 py-2"
      onPress={() => onPress(station)}
      accessibilityLabel={`${station.callsign}, ${station.frequency}${playing ? ', playing' : ''}`}
    >
      <FacilityTag facility={station.facility} active={playing} />
      <Item.Content className="gap-0.5">
        <View className="flex-row items-center gap-2">
          <T variant="title-3" numberOfLines={1} className="shrink">
            {station.callsign}
          </T>
          {saved ? <StarIcon size={14} weight="fill" color={warning} /> : null}
        </View>
        <T variant="caption-5" muted numberOfLines={1}>
          {detail}
        </T>
      </Item.Content>
      <Item.Actions className="items-end gap-1">
        <T variant="readout-sm">{station.frequency}</T>
        {playing ? (
          <AnimatedBadge status="success" size="sm" pulse>
            Live
          </AnimatedBadge>
        ) : null}
      </Item.Actions>
    </Item>
  );
});

export function StationRowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 px-2 py-2">
      <Skeleton className="h-12 w-12 rounded-md" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 w-28 rounded-sm" />
        <Skeleton className="h-3 w-44 rounded-sm" />
      </View>
      <Skeleton className="h-4 w-16 rounded-sm" />
    </View>
  );
}

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from 'panelui-native/components/alert';
import { Button } from 'panelui-native/components/button';
import { Chip } from 'panelui-native/components/chip';
import { EmptyState } from 'panelui-native/components/empty-state';
import { SearchBar } from 'panelui-native/components/search-bar';
import { BroadcastIcon, GearSixIcon, MagnifyingGlassIcon, StarIcon } from '@/components/icons';
import { MINI_PLAYER_CLEARANCE } from '@/components/player';
import { StationRow, StationRowSkeleton } from '@/components/station-row';
import { StationSheet } from '@/components/station-sheet';
import { useTokens } from '@/components/tokens';
import { T } from '@/components/type';
import { useFeed } from '@/lib/feed';
import { useListen } from '@/lib/listen';
import { usePrefs } from '@/lib/prefs';
import { FACILITIES, matchesQuery, type FacilityKey, type Station } from '@/lib/vatsim';

type Filter = 'ALL' | 'SAVED' | FacilityKey;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function ago(fetchedAt: number | null, now: number) {
  if (!fetchedAt) return 'waiting for the feed';
  const s = Math.max(0, Math.round((now - fetchedAt) / 1000));
  return s < 60 ? `updated ${s} s ago` : `updated ${Math.round(s / 60)} min ago`;
}

export default function Stations() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tokens = useTokens();
  const { data, error, loading, fetchedAt, refresh } = useFeed();
  const { saved, isSaved, toggleSaved } = usePrefs();
  const listen = useListen();
  const now = useNow(15_000);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selected, setSelected] = useState<Station | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const stations = data?.stations;
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: stations?.length ?? 0, SAVED: 0 };
    for (const s of stations ?? []) {
      c[s.facility] = (c[s.facility] ?? 0) + 1;
      if (saved.includes(s.callsign)) c.SAVED += 1;
    }
    return c;
  }, [stations, saved]);

  const visible = useMemo(
    () =>
      (stations ?? []).filter(
        (s) =>
          (filter === 'ALL' || (filter === 'SAVED' ? isSaved(s.callsign) : s.facility === filter)) &&
          matchesQuery(s, deferredQuery)
      ),
    [stations, filter, deferredQuery, isSaved]
  );

  // Keep the open sheet showing the latest copy of its station.
  const sheetStation = useMemo(
    () => (selected && stations?.find((s) => s.callsign === selected.callsign)) || selected,
    [selected, stations]
  );

  const openStation = useCallback((s: Station) => {
    setSelected(s);
    setSheetOpen(true);
  }, []);

  const playing = listen.station?.callsign;
  const renderItem = useCallback(
    ({ item }: { item: Station }) => (
      <StationRow
        station={item}
        saved={isSaved(item.callsign)}
        playing={item.callsign === playing}
        now={now}
        onPress={openStation}
      />
    ),
    [isSaved, playing, now, openStation]
  );

  const filters: { key: Filter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'SAVED', label: 'Saved' },
    ...FACILITIES.map((f) => ({ key: f.key, label: f.label })),
  ];

  const header = (
    <View className="gap-4 pb-2">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <T variant="heading-5">Live ATC</T>
          <T variant="caption-5" muted numberOfLines={1}>
            {stations ? `${stations.length} stations on frequency · ${ago(fetchedAt, now)}` : 'Reading the VATSIM network'}
          </T>
        </View>
        <Button variant="ghost" size="icon" onPress={() => router.push('/settings')} accessibilityLabel="Settings">
          <GearSixIcon size={24} color={tokens.foreground} />
        </Button>
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Callsign, airport, frequency or name"
        panel="never"
        cancel="never"
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {filters.map((f) => (
          <Chip
            key={f.key}
            size="lg"
            variant="outline"
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
            start={f.key === 'SAVED' ? <StarIcon size={14} weight="fill" color={tokens.warning} /> : undefined}
            accessibilityLabel={`${f.label}, ${counts[f.key] ?? 0} stations`}
          >
            {`${f.label} ${counts[f.key] ?? 0}`}
          </Chip>
        ))}
      </ScrollView>

      {error ? (
        <Alert variant="destructive">
          <Alert.Content>
            <Alert.Title>{stations ? 'Showing the last list we received' : 'No station list yet'}</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </View>
  );

  const empty = !stations ? (
    error ? undefined : (
      <View accessibilityLabel="Loading stations">
        {Array.from({ length: 8 }, (_, i) => (
          <StationRowSkeleton key={i} />
        ))}
      </View>
    )
  ) : (
    <EmptyState className="pt-12">
      <EmptyState.Header>
        <EmptyState.Media>
          {filter === 'SAVED' ? (
            <StarIcon size={28} color={tokens.foreground} />
          ) : query ? (
            <MagnifyingGlassIcon size={28} color={tokens.foreground} />
          ) : (
            <BroadcastIcon size={28} color={tokens.foreground} />
          )}
        </EmptyState.Media>
        <EmptyState.Title>
          {filter === 'SAVED' && !query
            ? 'No saved stations online'
            : query
              ? `Nothing matches ${query}`
              : 'No one on this position right now'}
        </EmptyState.Title>
        <EmptyState.Description>
          {filter === 'SAVED' && !query
            ? 'Open a station and tap Save. It shows here whenever that controller is online.'
            : 'Try another callsign or airport, or check back once more controllers log on.'}
        </EmptyState.Description>
      </EmptyState.Header>
      {filter !== 'ALL' || query ? (
        <EmptyState.Content>
          <Button
            variant="outline"
            onPress={() => {
              setFilter('ALL');
              setQuery('');
            }}
          >
            Show all stations
          </Button>
        </EmptyState.Content>
      ) : null}
    </EmptyState>
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={visible}
        keyExtractor={(s) => s.callsign}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={9}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + (listen.station ? MINI_PLAYER_CLEARANCE : 24),
        }}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!stations}
            onRefresh={refresh}
            tintColor={tokens.muted}
            colors={[tokens.primary]}
            progressBackgroundColor={tokens.background}
          />
        }
      />

      <StationSheet
        station={sheetStation}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        saved={!!sheetStation && isSaved(sheetStation.callsign)}
        playing={!!sheetStation && sheetStation.callsign === playing}
        onToggleSaved={() => sheetStation && toggleSaved(sheetStation.callsign)}
        onListen={() => {
          if (!sheetStation) return;
          setSheetOpen(false);
          listen.open(sheetStation);
        }}
        onStop={() => {
          setSheetOpen(false);
          listen.stop();
        }}
      />
    </View>
  );
}

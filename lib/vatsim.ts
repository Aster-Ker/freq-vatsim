/**
 * The public VATSIM network feed, reduced to what a listener needs: who is
 * controlling, on which frequency, and what they have published.
 *
 * https://data.vatsim.net/v3/vatsim-data.json is refreshed every 15 seconds
 * and needs no account.
 */

export const FEED_URL = 'https://data.vatsim.net/v3/vatsim-data.json';

/** listen.vatsim.net plays one station at a time, addressed by its callsign. */
export const listenUrl = (callsign: string) =>
  `https://listen.vatsim.net/live/${encodeURIComponent(callsign.toUpperCase())}`;

export type FacilityKey = 'DEL' | 'GND' | 'TWR' | 'APP' | 'CTR' | 'FSS' | 'ATIS';

export const FACILITIES: { key: FacilityKey; label: string }[] = [
  { key: 'DEL', label: 'Delivery' },
  { key: 'GND', label: 'Ground' },
  { key: 'TWR', label: 'Tower' },
  { key: 'APP', label: 'Approach' },
  { key: 'CTR', label: 'Center' },
  { key: 'FSS', label: 'Flight service' },
  { key: 'ATIS', label: 'ATIS' },
];

export const facilityLabel = (key: FacilityKey) => FACILITIES.find((f) => f.key === key)?.label ?? key;

export type Station = {
  callsign: string;
  /** "118.700", as the feed writes it. */
  frequency: string;
  facility: FacilityKey;
  /** The ICAO or area prefix: EGLL for EGLL_TWR, LON for LON_S_CTR. */
  area: string;
  name: string;
  cid: number;
  rating: string;
  ratingLong: string;
  logonTime: string;
  /** The controller info or ATIS text, one line per entry. */
  info: string[];
  atisCode: string | null;
};

/** A connected pilot, reduced to what the player shows next to a callsign. */
export type Pilot = {
  callsign: string;
  /** ICAO type, "A20N"; empty without a flight plan. */
  aircraft: string;
  departure: string;
  arrival: string;
};

export type FeedSnapshot = {
  stations: Station[];
  /** Every connected pilot, by callsign. */
  pilots: Map<string, Pilot>;
  updatedAt: string;
  connectedClients: number;
};

type RawController = {
  cid: number;
  name: string;
  callsign: string;
  frequency: string;
  facility: number;
  rating: number;
  text_atis: string[] | null;
  logon_time: string;
  atis_code?: string | null;
};

type RawPilot = {
  callsign: string;
  flight_plan?: { aircraft_short?: string; departure?: string; arrival?: string } | null;
};

type RawFeed = {
  general: { update_timestamp: string; connected_clients: number };
  pilots?: RawPilot[];
  controllers: RawController[];
  atis: RawController[];
  ratings: { id: number; short: string; long: string }[];
};

/** Facility ids from the feed. 0 is an observer, which has nothing to hear. */
const FACILITY_BY_ID: Record<number, FacilityKey | undefined> = {
  1: 'FSS',
  2: 'DEL',
  3: 'GND',
  4: 'TWR',
  5: 'APP',
  6: 'CTR',
};

/** The suffix wins over the facility id when they disagree, which happens with mentors and relief. */
const FACILITY_BY_SUFFIX: Record<string, FacilityKey | undefined> = {
  DEL: 'DEL',
  GND: 'GND',
  RMP: 'GND',
  TWR: 'TWR',
  APP: 'APP',
  DEP: 'APP',
  CTR: 'CTR',
  FSS: 'FSS',
  ATIS: 'ATIS',
};

/** 199.998 means connected but not on a frequency yet. */
const UNPRIMED = '199.998';

function toStation(raw: RawController, ratings: RawFeed['ratings'], isAtis: boolean): Station | null {
  const callsign = raw.callsign.toUpperCase();
  const parts = callsign.split('_');
  const suffix = parts[parts.length - 1];
  if (suffix === 'OBS' || suffix === 'SUP') return null;
  if (!raw.frequency || raw.frequency === UNPRIMED) return null;

  const facility = isAtis ? 'ATIS' : (FACILITY_BY_SUFFIX[suffix] ?? FACILITY_BY_ID[raw.facility]);
  if (!facility) return null;

  const rating = ratings.find((r) => r.id === raw.rating);
  return {
    callsign,
    frequency: raw.frequency,
    facility,
    area: parts[0],
    name: raw.name?.trim() || String(raw.cid),
    cid: raw.cid,
    rating: rating?.short ?? '',
    ratingLong: rating?.long ?? '',
    logonTime: raw.logon_time,
    info: (raw.text_atis ?? []).map((l) => l.trim()).filter(Boolean),
    atisCode: raw.atis_code ?? null,
  };
}

const ORDER: FacilityKey[] = ['DEL', 'GND', 'TWR', 'APP', 'CTR', 'FSS', 'ATIS'];

export function parseFeed(feed: RawFeed): FeedSnapshot {
  const stations = [
    ...feed.controllers.map((c) => toStation(c, feed.ratings, false)),
    ...feed.atis.map((c) => toStation(c, feed.ratings, true)),
  ].filter((s): s is Station => s !== null);

  stations.sort(
    (a, b) =>
      a.area.localeCompare(b.area) ||
      ORDER.indexOf(a.facility) - ORDER.indexOf(b.facility) ||
      a.callsign.localeCompare(b.callsign),
  );

  const pilots = new Map<string, Pilot>();
  for (const p of feed.pilots ?? []) {
    const callsign = p.callsign.toUpperCase();
    pilots.set(callsign, {
      callsign,
      aircraft: p.flight_plan?.aircraft_short ?? '',
      departure: p.flight_plan?.departure ?? '',
      arrival: p.flight_plan?.arrival ?? '',
    });
  }

  return {
    stations,
    pilots,
    updatedAt: feed.general.update_timestamp,
    connectedClients: feed.general.connected_clients,
  };
}

export async function fetchFeed(signal?: AbortSignal): Promise<FeedSnapshot> {
  const res = await fetch(FEED_URL, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`The VATSIM feed answered ${res.status}.`);
  return parseFeed((await res.json()) as RawFeed);
}

/** Matches a callsign, an airport, a frequency or a controller's name. */
export function matchesQuery(s: Station, query: string): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return true;
  if (s.callsign.includes(q) || s.name.toUpperCase().includes(q)) return true;
  const digits = q.replace(/[^0-9.]/g, '');
  return digits.length >= 3 && s.frequency.startsWith(digits);
}

/** "2 h 14 min", "38 min". */
export function onlineFor(logonTime: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(logonTime)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Who is tuned in

export const TRANSCEIVERS_URL = 'https://data.vatsim.net/v3/transceivers-data.json';

type RawTransceivers = { callsign: string; transceivers: { frequency: number }[] }[];

/**
 * Every connected client's radios: callsign to the frequencies it has tuned,
 * written the way the main feed writes them ("118.505"). This is how VATSIM's
 * own AFV map matches radios to positions.
 */
export async function fetchTuned(signal?: AbortSignal): Promise<Map<string, string[]>> {
  const res = await fetch(TRANSCEIVERS_URL, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`The VATSIM transceivers feed answered ${res.status}.`);
  const raw = (await res.json()) as RawTransceivers;
  const tuned = new Map<string, string[]>();
  for (const client of raw) {
    tuned.set(
      client.callsign.toUpperCase(),
      client.transceivers.map((t) => (t.frequency / 1_000_000).toFixed(3)),
    );
  }
  return tuned;
}

/** Pilots with a radio on this frequency. */
export function pilotsOn(
  frequency: string,
  tuned: Map<string, string[]>,
  pilots: Map<string, Pilot>,
): Pilot[] {
  const out: Pilot[] = [];
  for (const [callsign, freqs] of tuned) {
    const pilot = pilots.get(callsign);
    if (pilot && freqs.includes(frequency)) out.push(pilot);
  }
  return out.sort((a, b) => a.callsign.localeCompare(b.callsign));
}

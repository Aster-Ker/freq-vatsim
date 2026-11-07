/**
 * Works out which callsign a transmission belongs to, from its subtitles.
 *
 * The Listen page knows who is transmitting but does not share it, so Freq
 * infers it: it looks for one of the callsigns tuned to the frequency in what
 * was said, then uses where the callsign sits to guess who said it. A
 * controller calling an aircraft puts the callsign first ("Speedbird 412,
 * cleared to land"); a pilot reading back puts it last ("cleared to land,
 * Speedbird 412"). It is an inference, and the UI says so.
 */

/**
 * Radio telephony designators for airlines common on VATSIM, ICAO code first.
 * Lower case, as the recognizer writes words. Only designators known to be
 * current are listed; an airline missing here can still be matched by its
 * flight number (see matchCallsign).
 */
export const TELEPHONY: Record<string, string> = {
  AAL: 'american',
  ACA: 'air canada',
  AEE: 'aegean',
  AFL: 'aeroflot',
  AFR: 'airfrans',
  AIC: 'air india',
  AMX: 'aeromexico',
  ANA: 'all nippon',
  ANZ: 'new zealand',
  ASA: 'alaska',
  AUA: 'austrian',
  AVA: 'avianca',
  BAW: 'speedbird',
  BEL: 'beeline',
  BTI: 'air baltic',
  CCA: 'air china',
  CES: 'china eastern',
  CFG: 'condor',
  CLX: 'cargolux',
  CMP: 'copa',
  CPA: 'cathay',
  CSN: 'china southern',
  DAL: 'delta',
  DLH: 'lufthansa',
  EIN: 'shamrock',
  EJU: 'alpine',
  ELY: 'el al',
  ENY: 'envoy',
  ETD: 'etihad',
  ETH: 'ethiopian',
  EWG: 'eurowings',
  EXS: 'channex',
  EZS: 'topswiss',
  EZY: 'easy',
  FDX: 'fedex',
  FIN: 'finnair',
  GFA: 'gulf air',
  IBE: 'iberia',
  ICE: 'iceair',
  JAL: 'japan air',
  JBU: 'jetblue',
  KAL: 'koreanair',
  KLM: 'klm',
  LGL: 'luxair',
  LOT: 'pollot',
  MSR: 'egyptair',
  NKS: 'spirit wings',
  QFA: 'qantas',
  QTR: 'qatari',
  RYR: 'ryanair',
  SAS: 'scandinavian',
  SIA: 'singapore',
  SKW: 'skywest',
  SVA: 'saudia',
  SWA: 'southwest',
  SWR: 'swiss',
  TAP: 'air portugal',
  THA: 'thai',
  THY: 'turkish',
  TRA: 'transavia',
  UAE: 'emirates',
  UAL: 'united',
  UPS: 'ups',
  VIR: 'virgin',
  VLG: 'vueling',
  WJA: 'westjet',
  WZZ: 'wizz air',
};

const PHONETIC: Record<string, string> = {
  alpha: 'A',
  alfa: 'A',
  bravo: 'B',
  charlie: 'C',
  delta: 'D',
  echo: 'E',
  foxtrot: 'F',
  golf: 'G',
  hotel: 'H',
  india: 'I',
  juliet: 'J',
  juliett: 'J',
  kilo: 'K',
  lima: 'L',
  mike: 'M',
  november: 'N',
  oscar: 'O',
  papa: 'P',
  quebec: 'Q',
  romeo: 'R',
  sierra: 'S',
  tango: 'T',
  uniform: 'U',
  victor: 'V',
  whiskey: 'W',
  whisky: 'W',
  xray: 'X',
  yankee: 'Y',
  zulu: 'Z',
};

const UNITS: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  tree: 3,
  four: 4,
  five: 5,
  fife: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  niner: 9,
};
const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Words that open a pilot's first call to a station ("London, Speedbird 412, ..."). */
const STATION_WORDS = new Set([
  'tower',
  'ground',
  'delivery',
  'clearance',
  'approach',
  'director',
  'radar',
  'control',
  'centre',
  'center',
  'departure',
  'information',
  'apron',
  'ramp',
  'radio',
]);

/**
 * One spoken unit: a run of digits and letters ("412", "12K") or a plain word.
 * Callsign characters are merged across words, so "four one two" and "four
 * twelve" both become "412".
 */
type Unit = { text: string; alnum: boolean; start: number; end: number };

function toUnits(words: string[]): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  while (i < words.length) {
    const start = i;
    let code = '';
    while (i < words.length) {
      const w = words[i];
      if (UNITS[w] !== undefined) {
        code += UNITS[w];
        i++;
      } else if (TEENS[w] !== undefined) {
        code += TEENS[w];
        i++;
      } else if (TENS[w] !== undefined) {
        // "twenty three" is 23; "twenty" alone is 20.
        const next = words[i + 1];
        if (next !== undefined && UNITS[next] !== undefined && UNITS[next] > 0) {
          code += TENS[w] + UNITS[next];
          i += 2;
        } else {
          code += TENS[w];
          i++;
        }
      } else if (PHONETIC[w] !== undefined && code.length > 0) {
        // A letter only counts once the run has started ("one two kilo"), so
        // that ordinary words like "delta" in "delta four" are handled below.
        code += PHONETIC[w];
        i++;
      } else if (/^\d+$/.test(w)) {
        code += w;
        i++;
      } else break;
    }
    if (code) {
      units.push({ text: code, alnum: true, start, end: i - 1 });
    } else {
      units.push({ text: words[i], alnum: false, start: i, end: i });
      i++;
    }
  }
  return units;
}

/** Edit distance, for telephony words the recognizer bent ("speed bird", "left hansa"). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function similar(heard: string, expected: string): boolean {
  if (heard === expected) return true;
  const allowed = expected.length >= 8 ? 2 : expected.length >= 5 ? 1 : 0;
  return distance(heard, expected) <= allowed;
}

export type Role = 'pilot' | 'atc' | 'unknown';
export type CallsignMatch = {
  callsign: string;
  /** Who most likely spoke: the pilot of this callsign, or the controller calling it. */
  role: Role;
  /** Matched on the airline name and number, or on the number alone. */
  strength: 'full' | 'number';
};

type Pattern = { callsign: string; telephony: string | null; code: string };

function patternFor(callsign: string): Pattern | null {
  const airline = callsign.match(/^([A-Z]{3})(\d[0-9A-Z]{0,4})$/);
  if (airline && TELEPHONY[airline[1]])
    return { callsign, telephony: TELEPHONY[airline[1]], code: airline[2] };
  // An airline Freq has no name for keeps its full callsign; its number can
  // still match on its own below.
  // General aviation: the registration, spelled out ("november one two three alpha bravo").
  if (/^[A-Z][A-Z0-9]{3,6}$/.test(callsign)) return { callsign, telephony: null, code: callsign };
  return null;
}

/**
 * Runs of spelled-out characters, letters included from the first word:
 * "golf alpha bravo charlie delta" is GABCD, "november one two three alpha
 * bravo" is N123AB. Used for registrations, which can start with letters.
 */
function spelledRuns(words: string[]): { code: string; start: number; end: number }[] {
  const runs: { code: string; start: number; end: number }[] = [];
  let i = 0;
  while (i < words.length) {
    const start = i;
    let code = '';
    while (i < words.length) {
      const w = words[i];
      if (PHONETIC[w] !== undefined) code += PHONETIC[w];
      else if (UNITS[w] !== undefined && w !== 'oh') code += UNITS[w];
      else if (/^\d+$/.test(w)) code += w;
      else break;
      i++;
    }
    if (code.length >= 3) runs.push({ code, start, end: i - 1 });
    if (i === start) i++;
  }
  return runs;
}

function roleFor(words: string[], startWord: number, endWord: number): Role {
  const before = words.slice(0, startWord);
  const after = words.length - 1 - endWord;
  // "London tower, speedbird 412, ..." is a pilot calling the station.
  if (before.some((w) => STATION_WORDS.has(w))) return 'pilot';
  if (startWord === 0) return 'atc';
  // At the end, after a word or more, is a readback ("wilco, golf charlie delta").
  if (after <= 2) return 'pilot';
  if (startWord === 1) return 'atc';
  return 'unknown';
}

/**
 * The callsign this transmission belongs to, among the candidates (pilots
 * tuned to the frequency), or null. Matching on a flight number alone is only
 * done when it points at exactly one candidate.
 */
export function matchCallsign(raw: string, candidates: string[]): CallsignMatch | null {
  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || !candidates.length) return null;
  const units = toUnits(words);
  const patterns = candidates.map((c) => patternFor(c.toUpperCase())).filter((p): p is Pattern => p !== null);

  type Hit = { p: Pattern; strength: 'full' | 'number'; startWord: number; endWord: number };
  const hits: Hit[] = [];

  // Airlines: the airline name, then the flight number.
  for (const unit of units) {
    if (!unit.alnum) continue;
    for (const p of patterns) {
      if (!p.telephony || unit.text !== p.code) continue;
      const tel = p.telephony.replace(/\s+/g, '');
      let found = -1;
      for (let n = 1; n <= 3 && found < 0; n++) {
        const from = unit.start - n;
        if (from < 0) break;
        if (similar(words.slice(from, unit.start).join(''), tel)) found = from;
      }
      if (found >= 0) hits.push({ p, strength: 'full', startWord: found, endWord: unit.end });
      else if (p.code.length >= 3)
        hits.push({ p, strength: 'number', startWord: unit.start, endWord: unit.end });
    }
  }

  // Registrations (and airlines Freq has no name for): spelled out in full,
  // or shortened to the first letter and the last two ("golf charlie delta").
  for (const run of spelledRuns(words)) {
    for (const p of patterns) {
      if (p.telephony) continue;
      const full = p.code;
      const short = full[0] + full.slice(-2);
      if (run.code === full || (full.length > 3 && run.code === short)) {
        hits.push({ p, strength: 'full', startWord: run.start, endWord: run.end });
      } else if (/^[A-Z]{3}\d/.test(full) && run.code === full.slice(3) && full.length - 3 >= 3) {
        hits.push({ p, strength: 'number', startWord: run.start, endWord: run.end });
      }
    }
  }

  const full = hits.filter((h) => h.strength === 'full');
  const pick =
    full[0] ??
    (() => {
      const byNumber = hits.filter((h) => h.strength === 'number');
      const distinct = new Set(byNumber.map((h) => h.p.callsign));
      return distinct.size === 1 ? byNumber[0] : undefined;
    })();
  if (!pick) return null;

  return {
    callsign: pick.p.callsign,
    role: roleFor(words, pick.startWord, pick.endWord),
    strength: pick.strength,
  };
}

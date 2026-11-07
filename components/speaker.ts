import type { CallsignMatch } from '@/lib/callsigns';
import type { Pilot } from '@/lib/vatsim';

export type SpeakerText = {
  /** Who is talking: the pilot's callsign, or the station's when it is the controller. */
  who: string;
  /** One more line: the aircraft and route, or who the controller is calling. */
  detail: string;
  /** Short form for a subtitle line: "BAW412" or "EGLL_N_TWR → BAW412". */
  tag: string;
};

/**
 * Words for an inferred speaker. These come from the subtitles, not from
 * VATSIM, so the UI always pairs them with "from subtitles".
 */
export function speakerText(
  match: CallsignMatch,
  station: string,
  pilot: (callsign: string) => Pilot | undefined,
): SpeakerText {
  const p = pilot(match.callsign);
  const flight =
    p && (p.aircraft || p.departure)
      ? [p.aircraft, p.departure && p.arrival ? `${p.departure} → ${p.arrival}` : p.departure]
          .filter(Boolean)
          .join(' · ')
      : '';
  switch (match.role) {
    case 'pilot':
      return { who: match.callsign, detail: flight || 'Pilot', tag: match.callsign };
    case 'atc':
      return { who: station, detail: `Calling ${match.callsign}`, tag: `${station} → ${match.callsign}` };
    default:
      return {
        who: match.callsign,
        detail: flight ? `Mentioned · ${flight}` : 'Mentioned',
        tag: `${match.callsign}?`,
      };
  }
}

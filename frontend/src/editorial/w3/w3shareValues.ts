import type { RaceDebrief } from '../../api/debrief'

/**
 * THE VALUES A RIDER CAN PUT ON A CARD.
 *
 * The share screen used to ask which BLOCKS to draw — a chart, a zone bar, a
 * route trace — because the old poster composed itself out of them. The pen's
 * five templates have fixed compositions, so the only thing left to choose is
 * which measurements fill their slots, and that is a much easier question: a
 * rider knows they want their climbing on there; they do not know whether they
 * want a "zone block".
 *
 * Every entry resolves from the debrief the card already has. A value the ride
 * did not record returns null and is not offered — an empty slot is never
 * printed and a dash is never passed off as a measurement.
 */

export type ValueId =
  | 'distance' | 'time' | 'ascent' | 'speed' | 'power' | 'np'
  | 'tss' | 'kj' | 'hr' | 'wkg' | 'if'

export interface ValueDef {
  id: ValueId
  /** The rider-facing name, in the chip. */
  label: string
  /** The short label printed on the card itself. */
  short: string
  resolve: (d: RaceDebrief, weightKg: number | null) => string | null
}

const de = (n: number, dp = 0) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: dp, maximumFractionDigits: dp })

const hms = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`

export const VALUES: ValueDef[] = [
  {
    id: 'distance', label: 'Distanz', short: 'KM',
    resolve: (d) => d.header.distance_km != null ? `${de(d.header.distance_km, 1)}` : null,
  },
  {
    id: 'time', label: 'Zeit', short: 'BEWEGTE ZEIT',
    resolve: (d) => d.header.moving_time_s ? hms(d.header.moving_time_s) : null,
  },
  {
    id: 'ascent', label: 'Höhenmeter', short: 'HÖHENMETER',
    resolve: (d) => d.header.elevation_m != null ? de(Math.round(d.header.elevation_m)) : null,
  },
  {
    id: 'speed', label: 'Ø Tempo', short: 'Ø TEMPO',
    // The debrief already carries it; deriving it again from distance and time
    // would disagree with the ride page by a decimal on any paused ride.
    resolve: (d) => d.header.avg_speed_kmh != null ? `${de(d.header.avg_speed_kmh, 1)} km/h` : null,
  },
  {
    id: 'np', label: 'Ø Leistung', short: 'Ø LEISTUNG',
    resolve: (d) => d.header.np_watts != null ? `${Math.round(d.header.np_watts)} W` : null,
  },
  {
    id: 'power', label: 'Bestleistung', short: 'BESTWERT',
    resolve: (d) => {
      const best = d.efforts.reduce<number | null>(
        (m, e) => (e.ride_watts != null && (m == null || e.ride_watts > m) ? e.ride_watts : m), null)
      return best != null ? `${Math.round(best)} W` : null
    },
  },
  {
    id: 'wkg', label: 'W/kg', short: 'W/KG',
    resolve: (d, kg) => (d.header.np_watts != null && kg ? `${de(d.header.np_watts / kg, 1)}` : null),
  },
  {
    id: 'tss', label: 'TSS', short: 'TSS',
    resolve: (d) => d.header.tss != null ? String(Math.round(d.header.tss)) : null,
  },
  {
    id: 'kj', label: 'Arbeit', short: 'KJ',
    resolve: (d) => d.header.total_kj != null ? de(Math.round(d.header.total_kj)) : null,
  },
  {
    id: 'hr', label: 'Puls', short: 'PULS ⌀',
    // Average HR is not on the debrief header; the story's own series carries
    // it, and a ride without a strap simply does not offer this value.
    resolve: (d) => {
      const hr = (d.story?.hr ?? []).filter((x): x is number => x != null)
      return hr.length ? String(Math.round(hr.reduce((a, b) => a + b, 0) / hr.length)) : null
    },
  },
  {
    id: 'if', label: 'Intensität', short: 'IF',
    resolve: (d) => d.header.if_ != null ? de(d.header.if_, 2) : null,
  },
]

export const VALUE_BY_ID: Record<string, ValueDef> =
  Object.fromEntries(VALUES.map((v) => [v.id, v]))

/** What a card leads with, and the two beside it, before the rider changes it. */
export const DEFAULT_VALUES: ValueId[] = ['distance', 'time', 'ascent']

/** Every slot on every template is filled or dropped — never printed empty. */
export const MAX_VALUES = 3
export const MIN_VALUES = 1

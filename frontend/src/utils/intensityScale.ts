/**
 * intensityScale — ONE colour + label scale for "how hard is this session",
 * keyed to the plan's own `category` vocabulary.
 *
 * Why this exists. The week list on the Plan tab rendered every session with
 * the same medallion colour, because the colour was keyed to SPORT — and this
 * is a bike-only app, so every row was the same shade of grey-blue. The one
 * dimension that actually varies between a Monday recovery spin and a Thursday
 * VO₂ session was the only dimension the eye could not pick up, and a rider
 * scanning "what does my week look like?" got five identical rectangles.
 *
 * Intensity is the axis a cyclist reads a week by, so it gets the colour. The
 * scale runs cool→hot the way every training platform's zone chart does, which
 * means the week has a legible silhouette before a single word is read.
 *
 * The scale is deliberately shared rather than inlined per surface: the Plan
 * week list, the day preview and any future calendar must agree, or the same
 * session changes colour as the athlete navigates.
 */

/** The plan's day categories, from `DayPlan.category` in api/weeks.ts. */
export type SessionCategory =
  | 'rest' | 'recovery' | 'endurance' | 'tempo' | 'sweet_spot' | 'threshold' | 'vo2'

export interface IntensityStep {
  /** Base colour — used for the spine, the medallion tint and the zone chip. */
  color: string
  /** Coggan-ish zone shorthand for the chip. */
  zone: string
  /** 0–1 position on the scale, for anything that wants a proportional bar. */
  level: number
}

// Cool → hot. Blue/teal for the days that build the base, amber through the
// productive middle, coral/red for the two that hurt. These are the app's
// existing state colours (see flagshipColors in TodayTab), not a new palette.
const STEPS: Record<SessionCategory, IntensityStep> = {
  rest:       { color: '#5C6570', zone: '—',  level: 0 },
  recovery:   { color: '#38B6FF', zone: 'Z1', level: 0.15 },
  endurance:  { color: '#16E08A', zone: 'Z2', level: 0.35 },
  tempo:      { color: '#FFD166', zone: 'Z3', level: 0.55 },
  sweet_spot: { color: '#FFB020', zone: 'Z3', level: 0.68 },
  threshold:  { color: '#FF7A3C', zone: 'Z4', level: 0.85 },
  vo2:        { color: '#FA1E55', zone: 'Z5', level: 1 },
}

/** Fallback for an unknown/absent category — neutral, never a fabricated
 *  intensity. A grey spine reads as "not classified", not as "easy". */
const UNKNOWN: IntensityStep = { color: '#5C6570', zone: '', level: 0 }

export function intensityStep(category: string | null | undefined): IntensityStep {
  if (!category) return UNKNOWN
  return STEPS[category as SessionCategory] ?? UNKNOWN
}

/** Human name for the category, in the athlete's language. Matches the wording
 *  `sessionIntensity` already uses on Today so the two never disagree. */
export function intensityLabel(category: string | null | undefined, de: boolean): string | null {
  switch (category) {
    case 'rest': return de ? 'Ruhe' : 'Rest'
    case 'recovery': return de ? 'Erholung' : 'Recovery'
    case 'endurance': return de ? 'Grundlage' : 'Endurance'
    case 'tempo': return 'Tempo'
    case 'sweet_spot': return de ? 'Sweetspot' : 'Sweet spot'
    case 'threshold': return de ? 'Schwelle' : 'Threshold'
    case 'vo2': return 'VO₂'
    default: return null
  }
}

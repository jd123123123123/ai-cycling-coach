import type { ActivityRead } from '../api/dashboard'
import type { AthleteProfile } from '../types/athlete'

// Xert's "Focus" pattern — a single word that tells you what a ride was
// about. Strava's rollout feed is essentially a list of mini-recaps; a
// one-word classifier travels better than a zone pie because it fits where
// the eye already is.

export type FocusLabel =
  | 'Recovery'
  | 'Endurance'
  | 'Tempo'
  | 'Sweet Spot'
  | 'Threshold'
  | 'VO₂'
  | 'Big Day'
  | 'Brick'
  | 'Mixed'

export interface FocusBadge {
  label: FocusLabel
  color: string
  bg: string
  /** Plain-English one-liner explaining the label. Used in tooltips. */
  note: string
}

// HR-ratio thresholds from Friel / Coggan zones, expressed as percent of
// LTHR. These are the same bands we use in PolarizedDistribution, so the
// whole app agrees on the math.
function classifyByHrRatio(ratio: number): FocusLabel {
  if (ratio < 0.60) return 'Recovery'
  if (ratio < 0.82) return 'Endurance'
  if (ratio < 0.88) return 'Tempo'
  if (ratio < 0.94) return 'Sweet Spot'
  if (ratio < 1.00) return 'Threshold'
  return 'VO₂'
}

// IF-based classification for cycling (Seiler 2009 / Coggan power zones).
function classifyByIF(ifVal: number): FocusLabel {
  if (ifVal < 0.55) return 'Recovery'
  if (ifVal < 0.77) return 'Endurance'
  if (ifVal < 0.90) return 'Tempo'
  if (ifVal < 1.00) return 'Threshold'
  return 'VO₂'
}

export function focusFor(a: ActivityRead, profile?: AthleteProfile | null): FocusBadge | null {
  const dur = a.duration_seconds ?? 0
  // Bail early on bogus data; a badge would be noise.
  if (dur < 10 * 60) return null

  // "Big Day" dominates when duration crosses 3h regardless of intensity —
  // the cycling tradition of long rides having their own psychological
  // weight. Overrides the zone classifier.
  const isBig = dur >= 3 * 3600

  let base: FocusLabel = 'Mixed'

  if (a.average_hr) {
    // Cascade 1: use athlete's sport-specific LTHR from profile.
    const lthr =
      (a.sport === 'running' ? profile?.lthr_running : profile?.lthr_cycling) ??
      // Cascade 2: estimate LTHR from athlete HRmax (Friel: LTHR ≈ 88% HRmax).
      // Anchored on athlete profile HRmax, NOT session peak HR.
      (profile?.max_heart_rate != null ? profile.max_heart_rate * 0.88 : null)

    if (lthr != null && lthr > 0) {
      const ratio = a.average_hr / lthr
      base = classifyByHrRatio(ratio)
    } else {
      // No profile HR data available — fall through to IF or duration heuristic.
      base = 'Mixed'
    }
  }

  // Cascade 3: for cycling with power data, use Intensity Factor when HR
  // classification wasn't possible (no LTHR and no athlete HRmax).
  if (
    base === 'Mixed' &&
    a.sport === 'cycling' &&
    a.normalized_power != null &&
    profile?.ftp_watts != null &&
    profile.ftp_watts > 0
  ) {
    const ifVal = a.normalized_power / profile.ftp_watts
    base = classifyByIF(ifVal)
  }

  // Cascade 4: duration heuristics when all metrics unavailable.
  if (base === 'Mixed') {
    if (dur >= 75 * 60) {
      base = 'Endurance'
    } else if (dur < 30 * 60) {
      base = 'Recovery'
    }
    // else stays 'Mixed' — honest absence beats wrong label
  }

  if (isBig && (base === 'Endurance' || base === 'Mixed' || base === 'Tempo')) {
    base = 'Big Day'
  }

  return styleFor(base)
}

const META: Record<FocusLabel, { color: string; note: string }> = {
  Recovery:    { color: 'var(--color-muted)',        note: 'Active recovery — parasympathetic reload.' },
  Endurance:   { color: 'var(--color-forest-2)',     note: 'Z2 base work — the aerobic engine.' },
  Tempo:       { color: 'rgba(120, 140, 80, 0.95)',  note: 'Tempo — middle-zone efficiency.' },
  'Sweet Spot':{ color: 'rgba(190, 124, 34, 0.95)',  note: 'Sweet spot — cost-efficient threshold lift.' },
  Threshold:   { color: 'rgba(214, 87, 47, 1)',       note: 'At threshold — lactate-tolerance stimulus.' },
  'VO₂':       { color: 'var(--color-alert)',        note: 'VO₂max — top-end ceiling work.' },
  'Big Day':   { color: 'var(--color-ink)',          note: '3h+ session — durability and fueling test.' },
  Brick:       { color: 'var(--color-ink-blue)',     note: 'Bike + run stacked — triathlon-specific.' },
  Mixed:       { color: 'var(--color-ink-2)',        note: 'Mixed-zone session.' },
}

function styleFor(label: FocusLabel): FocusBadge {
  const m = META[label]
  return {
    label,
    color: m.color,
    // Soft bg from the accent. Using color-mix keeps it automatic for both
    // tokenised colors and rgba strings.
    bg: `color-mix(in srgb, ${m.color} 12%, transparent)`,
    note: m.note,
  }
}

// ── German localization helpers ──────────────────────────────────────────
// The FocusLabel enum values stay English (used as keys + color mapping);
// these helpers translate the display word and tooltip note for German.

const LABEL_DE: Record<FocusLabel, string> = {
  Recovery:    'Erholung',
  Endurance:   'Ausdauer',
  Tempo:       'Tempo',
  'Sweet Spot':'Sweet Spot',
  Threshold:   'Schwelle',
  'VO₂':       'VO₂',
  'Big Day':   'Großer Tag',
  Brick:       'Brick',
  Mixed:       'Gemischt',
}

const NOTE_DE: Record<FocusLabel, string> = {
  Recovery:    'Aktive Erholung — parasympathischer Reset.',
  Endurance:   'Z2-Grundlage — der aerobe Motor.',
  Tempo:       'Tempo — Effizienz in der Mittelzone.',
  'Sweet Spot':'Sweet Spot — kosteneffizienter Schwellen-Reiz.',
  Threshold:   'An der Schwelle — Laktattoleranz-Reiz.',
  'VO₂':       'VO₂max — Arbeit an der Obergrenze.',
  'Big Day':   'Einheit über 3h — Durability- und Fueling-Test.',
  Brick:       'Rad + Lauf kombiniert — triathlon-spezifisch.',
  Mixed:       'Einheit mit gemischten Zonen.',
}

/** German display word for a focus label (enum stays English). */
export function focusLabelDe(label: FocusLabel): string {
  return LABEL_DE[label]
}

/** German tooltip note for a focus label. */
export function focusNoteDe(label: FocusLabel): string {
  return NOTE_DE[label]
}

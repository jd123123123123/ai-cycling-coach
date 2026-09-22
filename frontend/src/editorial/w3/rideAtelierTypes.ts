import type { W3RideHeroVm } from './W3RideMapHero'
export interface W3Repeat { label: string; watts: string; delta: number; verdict: string }
export interface W3Zone { z: string; name: string; min: string; pct: number; peak: boolean }
/** Modelled load at the ride date, compared with the preceding week. */
export interface W3Shift {
  key: string
  label: string
  value: string
  delta: string
  up: boolean
  /** Whether this direction is a good thing. Fatigue is never "good": it is the
   *  cost of the ride, and acid on this screen means you did something well. */
  good: boolean
  /** 0–1 on the quantity's own fixed scale. */
  fill: number
  /** Where it stood a week ago, same scale. Null with no history. */
  was: number | null
}

export interface W3Rank {
  durationSeconds: number
  dur: string
  /** The ride's own figure. */
  watts: string
  /** The record for that duration, or null when there is no history yet. */
  bestWatts: string | null
  wattsValue: number
  bestWattsValue: number | null
  /** "−22 W" · "NEUER BESTWERT" — the distance to the record, already signed. */
  note: string
  pr: boolean
  /** 0–1: the ride as a fraction of the record. The beam's lit part. */
  fill: number
}
export interface W3StatCard { v: string; l: string; s: string }

export interface MovedRow { label: string; delta: string; value: string; goal: string; beforePct: number; pct: number }

export interface W3RideVm {
  dateChip: string; sportChip: string; recordChip: string | null
  title: string
  bigStat: string; bigStatUnit: string; climb: string; avgSpeed: string
  power: number[]; powerNote: string
  // The GPX of the route + the ride's intensity (IF). Kept on the vm as well
  // as inside `hero` because the sections further down read them too — the
  // hero is a VIEW of this ride, not a second source of truth about it.
  // `intensity` used to sit here too. It was set by the page on every render
  // and read by nothing — the hero draws the IF beam from its own vm — so it
  // was one more slot the page had to keep correct for no reader.
  polyline: [number, number][] | null
  /** Everything the map-and-card hero renders. See `W3RideMapHero`. */
  hero: W3RideHeroVm
  // "What it moved you toward" — real season totals + this ride's contribution.
  movedSub: string; moved: MovedRow[]; movedFoot: string
  stats: W3StatCard[]                // 4
  execScore: string; execTotal: string
  verdictHeadline: string; verdictBody: string; aiModel: string | null
  repeatsScore: string; repeatsSub: string; repeats: W3Repeat[]
  zonesSub: string; zones: W3Zone[]
  ranksSub: string; ranks: W3Rank[]
  onYouDelta: string; ceilingLabel: string; ceilingBefore: string; ceilingAfter: string
  shifts: W3Shift[]
  fitness: string; fitnessD: string; fatigue: string; fatigueD: string; form: string; formD: string
  changesBody: string
}

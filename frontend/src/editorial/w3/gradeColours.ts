import { T } from './w3tokens'

/**
 * The road, coloured by how hard it is.
 *
 * THE ONE THING A CYCLING MAP CAN SAY that a general-purpose one cannot: not
 * where the route goes, but where it HURTS. A rider reading a coloured line
 * knows the shape of the day before they have opened a single chart, and knows
 * it in the place they are already looking.
 *
 * ── WHY CLIMBING GETS THE RAMP AND DESCENDING DOES NOT ───────────────────
 * A −9 % descent and a +9 % climb are not two ends of one scale; they are two
 * different experiences and only one of them is a cost. Colouring both by
 * magnitude paints a mountain route half red for the half the rider enjoyed.
 * So descent and flat share one calm colour — the brand acid, the route being
 * itself — and only the climbing side ramps. The red bits are the walls.
 *
 * ── AND WHY RED IS ALLOWED HERE ──────────────────────────────────────────
 * `bike_wear` and the workshop screens forbid red because a component past its
 * interval has not failed and must not be dressed as an error. This is a
 * different job: a 14 % ramp is not a warning about the rider, it is a fact
 * about the road, and a data scale that refuses its own top end has no top end.
 */

/** Stops in percent gradient, and the colour the line takes there. Anything
 *  between is interpolated, so a ramp reads as a ramp rather than as bands. */
const STOPS: [number, string][] = [
  [-99, T.acid],       // descending: the ride, unremarked
  [3, T.acid],         // and still the ride, up to a gradient nobody notices
  [6, T.acidLite],     // the first thing a rider would call a climb
  [9, T.warn],         // a real ramp — where a pass starts costing
  [13, T.bad],         // a wall
  [99, T.bad],
]

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')

/** The colour for one gradient, interpolated between the stops above. */
export function gradeColour(pct: number): string {
  let lo = STOPS[0]
  let hi = STOPS[STOPS.length - 1]
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (pct >= STOPS[i][0] && pct <= STOPS[i + 1][0]) {
      lo = STOPS[i]
      hi = STOPS[i + 1]
      break
    }
  }
  const span = hi[0] - lo[0]
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, (pct - lo[0]) / span))
  const a = hex(lo[1])
  const b = hex(hi[1])
  return `#${to2(a[0] + (b[0] - a[0]) * t)}${to2(a[1] + (b[1] - a[1]) * t)}${to2(a[2] + (b[2] - a[2]) * t)}`
}

/** One colour per polyline point, or null when the ride has no altitude.
 *
 *  Null rather than a flat fallback ramp: `RouteMap` draws its plain accent
 *  line when `lineColors` is absent, and a route coloured entirely "flat"
 *  would be a claim about terrain nobody measured. */
export function gradeColours(grades: number[] | null | undefined, points: number): string[] | null {
  if (!grades || grades.length !== points) return null
  return grades.map(gradeColour)
}

/** The legend, as the four things a rider actually distinguishes. */
export const GRADE_LEGEND: { label: string; colour: string }[] = [
  { label: 'flach', colour: gradeColour(0) },
  { label: '6 %', colour: gradeColour(6) },
  { label: '9 %', colour: gradeColour(9) },
  { label: '13 %+', colour: gradeColour(14) },
]

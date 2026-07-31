import type { RehearsalSegment } from '../../api/rehearsal'

/**
 * Turning simulated segments into the two things a map needs: a track, and a
 * colour for every point of it.
 *
 * Kept out of the view so both are testable without a WebGL context — the map
 * itself cannot render in jsdom, but "is the route in the right order" and
 * "are the hard kilometres the hot ones" are exactly the questions worth
 * pinning down, and they are pure functions of the segments.
 */

/** `[[lat, lng], …]`, the shape RouteMap takes. */
export type LatLng = [number, number]

/**
 * The track, in order. Segments without coordinates are dropped rather than
 * defaulted: a rehearsal stored before the map shipped has none, and a route
 * drawn through [0, 0] would put the athlete's Dolomites loop in the Atlantic.
 */
export function polylineFromSegments(segments: RehearsalSegment[]): LatLng[] {
  const out: LatLng[] = []
  for (const s of segments) {
    const { lat, lng } = s
    if (lat == null || lng == null) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    // Null Island is not a route. GPX exporters emit it for dropped fixes.
    if (lat === 0 && lng === 0) continue
    out.push([lat, lng])
  }
  return out
}

/** Indices into `segments` for each point of `polylineFromSegments` output. */
export function polylineIndices(segments: RehearsalSegment[]): number[] {
  const out: number[] = []
  segments.forEach((s, i) => {
    const { lat, lng } = s
    if (lat == null || lng == null) return
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (lat === 0 && lng === 0) return
    out.push(i)
  })
  return out
}

/**
 * The effort ramp: cool where the target watts are easy, hot where they are
 * hard. Scaled to THIS route's own range rather than to absolute watts, because
 * the question the map answers is "which parts of this ride are the hard ones",
 * and an absolute scale would paint a rolling 200 W parcours uniformly cold.
 *
 * Returns an empty array when nothing was predicted, which tells the caller to
 * fall back to the flat route colour instead of inventing a ramp.
 */
export function powerColors(segments: RehearsalSegment[]): string[] {
  const idxs = polylineIndices(segments)
  const powers = idxs.map((i) => segments[i].power_w)
  const known = powers.filter((p): p is number => p != null && Number.isFinite(p))
  if (known.length < 2) return []

  const lo = Math.min(...known)
  const hi = Math.max(...known)
  // A perfectly flat power plan has no ramp to draw; one colour is honest.
  if (hi - lo < 1e-6) return []

  return powers.map((p) => (p == null ? EFFORT_RAMP[0] : rampColor((p - lo) / (hi - lo))))
}

/**
 * Cold → hot in five steps, sampled from the app's own effort scale so a hard
 * kilometre on the map is the same colour as a hard kilometre everywhere else.
 * Literals rather than CSS vars because MapLibre paints on a WebGL canvas and
 * never resolves `var()`.
 */
const EFFORT_RAMP = ['#38B6FF', '#16E08A', '#FFD166', '#FF9F43', '#FF5A3C']

function rampColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  const i = Math.min(EFFORT_RAMP.length - 1, Math.floor(clamped * EFFORT_RAMP.length))
  return EFFORT_RAMP[i]
}

/** Segment indices where the simulator recorded a blow-up. */
export function blowUpIndices(
  segments: RehearsalSegment[],
  blowUps: { distance_m: number }[],
): number[] {
  if (segments.length === 0) return []
  return blowUps.map((b) => {
    let best = 0
    let bestGap = Infinity
    segments.forEach((s, i) => {
      const gap = Math.abs(s.start_m - b.distance_m)
      if (gap < bestGap) {
        bestGap = gap
        best = i
      }
    })
    return best
  })
}

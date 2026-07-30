/**
 * mergeClimbs — bridge the segmenter's climb fragments back into whole climbs.
 *
 * Its own module rather than an export from BreakdownPanels: the arithmetic is
 * worth unit-testing, and a component file that also exports a function breaks
 * fast refresh.
 */
import type { Climb } from '../../api/debrief'

/** The segmenter splits a climb every time the grade dips below its threshold,
 * so one long climb with varying steepness comes back as many fragments. Bridge
 * consecutive climb segments separated by only a short non-climb gap back into
 * a single climb — a real descent/valley (long gap) still keeps them apart. */
export function mergeClimbs(climbs: Climb[]): Climb[] {
  if (climbs.length <= 1) return climbs.slice()
  const sorted = [...climbs].sort((a, b) => a.start_s - b.start_s)
  const out: Climb[] = []
  let cur: Climb = { ...sorted[0] }
  for (let k = 1; k < sorted.length; k++) {
    const nx = sorted[k]
    const gap = nx.start_s - (cur.start_s + cur.duration_s)
    // Bridge only across a SHORT non-climb gap — a false-flat inside one climb
    // is seconds long; a real descent/valley between two passes runs minutes,
    // so an absolute cap keeps distinct climbs apart instead of snowballing the
    // whole ride into one giant "climb".
    const bridge = gap <= 90
    if (bridge) {
      const gain = cur.elev_gain_m + nx.elev_gain_m
      const dist = cur.distance_m + nx.distance_m
      // Both spans exist, but the gap's own DISTANCE is not in the payload, so
      // grade and VAM cannot be reconciled by adding it back. They must
      // describe ONE span or the row contradicts itself, so both use the
      // climbing-only span: the bridged gap is a false flat inside the climb
      // (<= 90 s by the rule above), not a stretch worth averaging over.
      // duration_s stays WALL CLOCK -- the TIME column should show how long the
      // climb actually took, gap included -- and only the VAM denominator is
      // the climbing-only span. Do not "fix" this back to `dur`.
      const climbDur = cur.duration_s + nx.duration_s
      const dur = nx.start_s + nx.duration_s - cur.start_s
      const wDur = (cur.w_per_kg != null ? cur.duration_s : 0) + (nx.w_per_kg != null ? nx.duration_s : 0)
      const wSum = (cur.w_per_kg != null ? cur.w_per_kg * cur.duration_s : 0) + (nx.w_per_kg != null ? nx.w_per_kg * nx.duration_s : 0)
      cur = {
        ...cur,
        duration_s: dur,
        distance_m: dist,
        elev_gain_m: gain,
        avg_grade_pct: dist > 0 ? (gain / dist) * 100 : cur.avg_grade_pct,
        vam_m_per_h: climbDur > 0 ? gain / (climbDur / 3600) : cur.vam_m_per_h,
        w_per_kg: wDur > 0 ? wSum / wDur : null,
      }
    } else {
      out.push(cur)
      cur = { ...nx }
    }
  }
  out.push(cur)
  return out
}

/**
 * Pure geometry for RouteProfile (components/crew/RouteProfile.tsx). Split out so
 * the component file exports only a component — the repo's react-refresh rule —
 * while the rolling-gradient maths stays unit-testable.
 */

/** Gradient over a rolling window of at least this many metres. Consecutive GPX
 *  points sit 5-10 m apart and barometric noise there produces absurd spikes, so
 *  a per-segment gradient would paint the strip with values no rider ever felt.
 *  Mirrors the backend's max-grade window for the same reason. */
export const GRADE_WINDOW_M = 200

export interface ProfilePoint { distM: number; eleM: number }

export function toProfilePoints(raw: [number, number][] | null | undefined): ProfilePoint[] {
  if (!raw || raw.length < 2) return []
  return raw
    .filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([distM, eleM]) => ({ distM, eleM }))
}

/** Per-sample gradient, each computed against the last point at least
 *  GRADE_WINDOW_M behind it. Returned aligned to `pts`. */
export function rollingGrades(pts: ProfilePoint[]): number[] {
  return pts.map((p, i) => {
    // Walk back to the newest point that is still at least GRADE_WINDOW_M
    // behind; if none is (start of the route), use the first point we have.
    let b = i
    while (b > 0 && p.distM - pts[b].distM < GRADE_WINDOW_M) b--
    const run = p.distM - pts[b].distM
    return run > 0 ? ((p.eleM - pts[b].eleM) / run) * 100 : 0
  })
}

import { describe, it, expect } from 'vitest'
import { roadProfileChanged } from '../DashboardShell'
import { buildRoadProfile } from '../../../utils/roadProfile'
import type { RoadPayload } from '../AuraContext'
import type { ResolvedBlock } from '../../../api/coach'

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'B', duration_s: 600, target_watts_low: 200, target_watts_high: 220,
    target_pct_ftp: 0.7, zone: 2, rpe: 4, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}
const profile = buildRoadProfile([block()], { cp: 250, wPrime: 20000 })
const payload = (p = profile): RoadPayload => ({ profile: p, mode: 'prescribed', color: '#16E08A', blocks: [block()] })

describe('roadProfileChanged', () => {
  // THE REGRESSION. `road?.profile` is `undefined` when road is null, while
  // `lastProfile` normalizes to `null`. Comparing them raw made this true on
  // EVERY render, so the render-phase setState never converged and React threw
  // "Too many re-renders" into the top-level ErrorBoundary. It fired whenever
  // the road payload was null — i.e. every 'bare' Today state, and for every
  // user once the road was disabled outright.
  it('reports NO change when there is no road, repeatedly', () => {
    expect(roadProfileChanged(null, null)).toBe(false)
    expect(roadProfileChanged(undefined, null)).toBe(false)
  })

  it('reports a change when a road first appears, then settles', () => {
    expect(roadProfileChanged(payload(), null)).toBe(true)
    expect(roadProfileChanged(payload(), profile)).toBe(false)
  })

  it('reports a change when the road goes away', () => {
    expect(roadProfileChanged(null, profile)).toBe(true)
  })

  it('reports a change when the profile identity changes', () => {
    const other = buildRoadProfile([block({ duration_s: 1200 })], { cp: 250, wPrime: 20000 })
    expect(roadProfileChanged(payload(other), profile)).toBe(true)
  })
})

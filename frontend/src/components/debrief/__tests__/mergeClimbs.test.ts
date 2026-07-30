import { describe, it, expect } from 'vitest'
import { mergeClimbs } from '../mergeClimbs'
import type { Climb } from '../../../api/debrief'

const climb = (o: Partial<Climb> & { start_s: number; duration_s: number }): Climb => ({
  distance_m: 1000,
  elev_gain_m: 50,
  avg_grade_pct: 5,
  vam_m_per_h: 600,
  w_per_kg: null,
  avg_power: null,
  category: '4',
  ...o,
})

describe('mergeClimbs', () => {
  it('spans grade and VAM over the same distance when bridging a gap', () => {
    // Two 1 km / 50 m segments, 60 s apart -> bridged into one climb.
    const [m] = mergeClimbs([
      climb({ start_s: 0, duration_s: 300 }),
      climb({ start_s: 360, duration_s: 300 }),
    ])
    // gain 100 m. Duration spans 0..660 s (wall clock, gap included).
    expect(m.elev_gain_m).toBe(100)
    expect(m.duration_s).toBe(660)
    // Grade and VAM must describe ONE span. Grade is computed over the
    // climbing-only distance (2000 m), so VAM must use the climbing-only
    // duration (600 s) too — not the 660 s wall clock, which would imply a
    // longer, gentler climb than the gradient claims.
    expect(m.avg_grade_pct).toBeCloseTo(5, 5)
    expect(m.vam_m_per_h).toBeCloseTo(100 / (600 / 3600), 5)
  })

  it('keeps climbs separated by a long descent apart', () => {
    const out = mergeClimbs([
      climb({ start_s: 0, duration_s: 300 }),
      climb({ start_s: 1200, duration_s: 300 }),
    ])
    expect(out).toHaveLength(2)
  })
})

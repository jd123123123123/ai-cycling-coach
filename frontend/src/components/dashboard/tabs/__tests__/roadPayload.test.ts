import { describe, it, expect } from 'vitest'
import { roadPowerInputs, buildRoadPayload } from '../TodayTab'
import { buildRoadProfile } from '../../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../../api/coach'

describe('roadPowerInputs', () => {
  it('passes CP and W prime through when the model is valid', () => {
    expect(roadPowerInputs({ model_valid: true, cp_watts: 250, w_prime_j: 20000 }))
      .toEqual({ cp: 250, wPrime: 20000 })
  })

  it('withholds CP when the model is not valid — no waterline off a bad model', () => {
    expect(roadPowerInputs({ model_valid: false, cp_watts: 250, w_prime_j: 20000 }))
      .toEqual({ cp: null, wPrime: null })
  })

  it('withholds CP when model_valid is absent or the profile is missing', () => {
    expect(roadPowerInputs({ cp_watts: 250, w_prime_j: 20000 })).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs(null)).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs(undefined)).toEqual({ cp: null, wPrime: null })
  })

  it('withholds both when either value is missing', () => {
    expect(roadPowerInputs({ model_valid: true, cp_watts: 250 })).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs({ model_valid: true, w_prime_j: 20000 })).toEqual({ cp: null, wPrime: null })
  })
})

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'B', duration_s: 300,
    target_watts_low: 300, target_watts_high: 300, target_pct_ftp: 120,
    zone: 5, rpe: 8, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}

describe('buildRoadPayload — finding 5: the aura-vs-road gate', () => {
  const blocks = [block()]
  const profile = buildRoadProfile(blocks, { cp: 250, wPrime: 20000 })

  it("publishes null on 'bare' — the pending/loading state and the no-profile ready/controlled state — so DashboardShell's plain aura remains the honest fallback", () => {
    expect(buildRoadPayload('bare', profile, blocks, '#16E08A')).toBeNull()
  })

  it("publishes the full payload for every non-'bare' mode, carrying the SAME profile/blocks/color objects through untouched", () => {
    const modes = ['prescribed', 'ridden', 'flat-calm', 'flat-done', 'flat-unlit'] as const
    for (const mode of modes) {
      const payload = buildRoadPayload(mode, profile, blocks, '#16E08A')
      expect(payload).toEqual({ profile, mode, color: '#16E08A', blocks })
      // Identity, not just deep-equality: the terrain (profile) and the
      // readout (blocks) must be the literal same objects, or the two
      // surfaces could describe different workouts.
      expect(payload?.profile).toBe(profile)
      expect(payload?.blocks).toBe(blocks)
    }
  })

  it("publishing null on 'bare' even when a profile happens to have samples — 'bare' always wins", () => {
    expect(buildRoadPayload('bare', profile, blocks, '#16E08A')).toBeNull()
  })
})

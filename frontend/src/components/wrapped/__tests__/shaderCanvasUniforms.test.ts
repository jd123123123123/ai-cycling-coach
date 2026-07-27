import { describe, it, expect } from 'vitest'
import { packRoadTexture } from '../ShaderCanvas'
import { buildRoadProfile } from '../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../api/coach'

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'B', duration_s: 300,
    target_watts_low: 250, target_watts_high: 250, target_pct_ftp: 100,
    zone: 4, rpe: 6, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}

describe('packRoadTexture', () => {
  it('packs one RGBA texel per sample', () => {
    const p = buildRoadProfile([block()], { cp: 250, wPrime: 20000 })
    const tex = packRoadTexture(p)
    expect(tex.width).toBe(p.samples.length)
    expect(tex.data).toHaveLength(p.samples.length * 4)
  })

  it('puts watts/CP in R at the waterline for a block ridden exactly at CP', () => {
    const p = buildRoadProfile([block()], { cp: 250, wPrime: 20000 })
    const tex = packRoadTexture(p)
    // R encodes watts/cp over the range 0..2 → CP itself lands mid-scale.
    expect(tex.data[0]).toBeGreaterThanOrEqual(126)
    expect(tex.data[0]).toBeLessThanOrEqual(129)
  })

  it('reports a full tank in B when CP is unknown rather than a fake drain', () => {
    const p = buildRoadProfile([block()], { cp: null, wPrime: null })
    const tex = packRoadTexture(p)
    expect(tex.data[2]).toBe(255)
  })

  it('returns a 1-texel neutral texture for an empty profile', () => {
    const p = buildRoadProfile([], { cp: 250, wPrime: 20000 })
    const tex = packRoadTexture(p)
    expect(tex.width).toBe(1)
    expect(tex.data).toHaveLength(4)
  })

  it('clamps a negative-watts sample to a ground floor instead of wrapping to a bright value', () => {
    const p = buildRoadProfile([block()], { cp: 250, wPrime: 20000 })
    p.samples[0] = { ...p.samples[0], watts: -100 }
    const tex = packRoadTexture(p)
    expect(tex.data[0]).toBe(0)
  })
})

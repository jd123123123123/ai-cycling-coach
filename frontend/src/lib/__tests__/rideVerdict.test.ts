import { describe, it, expect } from 'vitest'
import { rideVerdict, rideVerdictColor } from '../rideVerdict'

describe('rideVerdict', () => {
  it('reads an easy spin as a warm win, never as a shortfall', () => {
    // Low IF + low score must NOT read negatively — easy is the point.
    const v = rideVerdict({ score: 30, if_: 0.55, tss: 25, durationS: 3600 }, 'simple', 'de')
    expect(v.tone).toBe('easy')
    expect(v.headline).toBe('Locker gehalten')
    expect(v.metricTail).toBeNull()
  })

  it('celebrates a strong hard session', () => {
    const v = rideVerdict({ score: 90, if_: 0.98, tss: 110, durationS: 5400 }, 'simple', 'de')
    expect(v.tone).toBe('strong')
    expect(v.headline).toBe('Starke Einheit')
  })

  it('is kind, not harsh, on a hard day that scored low', () => {
    const v = rideVerdict({ score: 35, if_: 0.95, tss: 90, durationS: 4000 }, 'simple', 'en')
    expect(v.tone).toBe('honest')
    expect(v.sub).toMatch(/still counts/i)
  })

  it('treats a base ride as solid regardless of score', () => {
    const strong = rideVerdict({ score: 85, if_: 0.72, tss: 60, durationS: 5400 }, 'simple', 'de')
    const low = rideVerdict({ score: 45, if_: 0.72, tss: 60, durationS: 5400 }, 'simple', 'de')
    expect(strong.tone).toBe('solid')
    expect(low.tone).toBe('solid')
    expect(low.headline).toBe('Grundlage im Kasten')
  })

  it('falls back warmly when no power/score is present', () => {
    const v = rideVerdict({ score: null, if_: null, tss: null, durationS: 3600 }, 'simple', 'en')
    expect(v.headline).toBe('Ride done')
    expect(v.tone).toBe('solid')
  })

  it('adds a metric tail only in technical mode', () => {
    const tech = rideVerdict({ score: 90, if_: 0.98, tss: 110, durationS: 5400 }, 'technical', 'de')
    expect(tech.metricTail).toBe('IF 0.98 · 110 TSS')
    const simple = rideVerdict({ score: 90, if_: 0.98, tss: 110, durationS: 5400 }, 'simple', 'de')
    expect(simple.metricTail).toBeNull()
  })

  it('respects locale for headline copy', () => {
    const en = rideVerdict({ score: 90, if_: 0.98, tss: 110, durationS: 5400 }, 'simple', 'en')
    expect(en.headline).toBe('Strong session')
  })

  it('maps tones to theme color tokens', () => {
    expect(rideVerdictColor('strong')).toContain('--color-accent')
    expect(rideVerdictColor('honest')).toContain('--color-amber')
    expect(rideVerdictColor('easy')).toContain('--color-recovery')
    expect(rideVerdictColor('solid')).toContain('--color-recovery')
  })
})

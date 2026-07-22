import { describe, it, expect } from 'vitest'
import { buildReadinessMethod, buildCpMethod } from '../methodsContent'

describe('buildReadinessMethod', () => {
  it('weights the six evidence signals and always cites a real source', () => {
    const c = buildReadinessMethod('en', { hrv: 62, rhr: 48, sleep: 84, tsb: -6, score: 72 })
    // The six documented weights sum to 100%.
    const pcts = c.constants.map((r) => Number(r.value.replace('%', '').trim()))
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100)
    // Citation is never fabricated — it is a fixed, real reference string.
    expect(c.citation).toContain('Plews')
    expect(c.formula).toContain('Σ')
  })

  it('renders missing inputs as an honest dash and counts present signals', () => {
    const c = buildReadinessMethod('de', { hrv: null, rhr: null, sleep: 80, tsb: 3, score: 60 })
    const hrvRow = c.inputs.find((r) => r.label === 'HRV')
    expect(hrvRow?.value).toBe('—')
    // 2 of 4 driver signals present → the uncertainty line says "2 von 6".
    expect(c.uncertainty).toContain('2 von 6')
  })
})

describe('buildCpMethod', () => {
  it('exposes the 2-parameter formula, fit band, and a real citation', () => {
    const c = buildCpMethod('en', {
      cp: 268, wPrimeJ: 21400, eftp: 262, rSquared: 0.97, confidence: 0.82, ridesN: 34,
    })
    expect(c.formula).toBe('P(t) = CP + W′ / t')
    expect(c.constants.some((r) => r.value.includes('2–20 min'))).toBe(true)
    expect(c.uncertainty).toContain('82%')
    expect(c.uncertainty).toContain('0.97')
    expect(c.citation).toContain('Monod')
  })

  it('does not fabricate precision when the fit is unavailable', () => {
    const c = buildCpMethod('de', {
      cp: null, wPrimeJ: null, eftp: null, rSquared: null, confidence: null, ridesN: null,
    })
    expect(c.inputs.every((r) => r.value === '—')).toBe(true)
    expect(c.uncertainty).toContain('Noch keine Fit-Güte')
  })
})

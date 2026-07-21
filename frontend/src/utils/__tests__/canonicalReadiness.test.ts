/**
 * ONE readiness score across surfaces (5-reviewer gate, Jul 2026).
 *
 * The canonical readiness is DailyDecision.readiness — the backend
 * multi-factor score the daily decision actually consumes (identical to
 * GET /coach/adaptive). Today and Recovery resolve through this selector,
 * so a Garmin 66 can never sit next to a backend 79 with the same label.
 */
import { describe, expect, it } from 'vitest'
import { canonicalReadiness, tierFromDecision } from '../metrics'

describe('tierFromDecision', () => {
  it('maps the backend verdict bands to the UI vocabulary', () => {
    expect(tierFromDecision('push', 79)).toBe('ready')
    expect(tierFromDecision('push', 90)).toBe('peak')
    expect(tierFromDecision('moderate', 55)).toBe('caution')
    expect(tierFromDecision('easy', 38)).toBe('caution')
    expect(tierFromDecision('rest', 20)).toBe('rest')
  })

  it('returns null on unknown/missing tiers', () => {
    expect(tierFromDecision(null, 70)).toBeNull()
    expect(tierFromDecision('weird', 70)).toBeNull()
  })

  it('never applies the frontend 70-threshold to a backend push score', () => {
    // Backend cuts push at 68 — a 68 must stay green, not fall to caution.
    expect(tierFromDecision('push', 68)).toBe('ready')
  })
})

describe('canonicalReadiness', () => {
  it('prefers the decision readiness over the device fallback', () => {
    const r = canonicalReadiness({ score: 79, tier: 'push' }, 66)
    expect(r.score).toBe(79)
    expect(r.tier).toBe('ready')
  })

  it('falls back to the device/composite chain while the decision loads', () => {
    const r = canonicalReadiness(null, 66)
    expect(r.score).toBe(66)
    expect(r.tier).toBe('caution')
  })

  it('decision score without a tier still resolves a tier', () => {
    const r = canonicalReadiness({ score: 79, tier: null }, 66)
    expect(r.score).toBe(79)
    expect(r.tier).toBe('ready')
  })

  it('null everywhere yields no score and no tier', () => {
    const r = canonicalReadiness(undefined, null)
    expect(r.score).toBeNull()
    expect(r.tier).toBeNull()
  })
})

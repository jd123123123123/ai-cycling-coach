import { describe, expect, it } from 'vitest'
import { milestoneMeta, milestoneLabel } from '../LevelStripCard'

describe('milestoneMeta (audit P1-11 — work meter, not levels)', () => {
  it('tracks progress toward the next 5,000 kJ milestone', () => {
    expect(milestoneMeta(48000)).toEqual({ pct: 60, toNext: 2000 })
    expect(milestoneMeta(2500)).toEqual({ pct: 50, toNext: 2500 })
    expect(milestoneMeta(5000)).toEqual({ pct: 0, toNext: 5000 })
  })
})

describe('milestoneLabel', () => {
  it('renders the exact audit copy in both locales', () => {
    expect(milestoneLabel(2000, true)).toBe('2.000 kJ bis zum nächsten Meilenstein — echte Arbeit')
    expect(milestoneLabel(2000, false)).toBe('2,000 kJ to your next milestone — real work')
  })

  it('carries zero gamification vocabulary', () => {
    for (const de of [true, false]) {
      expect(milestoneLabel(3023, de)).not.toMatch(/level|lvl|xp/i)
    }
  })
})

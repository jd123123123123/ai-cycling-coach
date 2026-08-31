import { describe, it, expect } from 'vitest'
import { buildWrappedVm } from '../w3wrapped'
import type { Wrapped } from '../../../pages/WeeklyWrapped'

/**
 * The deck's two rules: it escalates, and it never invents a slide.
 */

const BASE: Wrapped = {
  week_start: '2026-08-18', week_end: '2026-08-24', has_rides: true,
  totals: { sessions: 5, hours: 8.25, km: 214.6, tss: 486, active_days: 5, saddle_hm: '8h 15m' },
  planned_tss: 450, ctl_delta: 2.4, route: null,
  distance_comparison: null, saddle_line: null, daily_effort: [],
  elevation_m: 2140, peak_power: null, best_ride: null, rides: 5, zero_missed: true,
}

const keys = (w: Wrapped) => buildWrappedVm(w).slides.map((s) => s.key)

describe('the deck opens on a promise, not a number', () => {
  it('starts with a slide that carries no figure at all', () => {
    const first = buildWrappedVm(BASE).slides[0]
    expect(first.kind).toBe('open')
    expect(first.value).toBeUndefined()
  })

  it('ends on the shareable card', () => {
    const s = buildWrappedVm(BASE).slides
    expect(s[s.length - 1].key).toBe('finale')
  })
})

describe('no slide without its data', () => {
  it('skips peak power for a rider with no meter', () => {
    expect(keys({ ...BASE, peak_power: null })).not.toContain('peak')
  })

  it('includes it when the week recorded one', () => {
    expect(keys({
      ...BASE,
      peak_power: { watts: 1180, wkg: 16.4, comparison: [] },
    })).toContain('peak')
  })

  it('skips the best ride when the week has none', () => {
    expect(keys(BASE)).not.toContain('best')
  })

  it('skips the plan comparison when nothing was planned', () => {
    expect(keys({ ...BASE, planned_tss: null })).not.toContain('plan')
    expect(keys({ ...BASE, planned_tss: 0 })).not.toContain('plan')
  })

  it('skips distance entirely for a week with no kilometres', () => {
    expect(keys({ ...BASE, totals: { ...BASE.totals, km: 0 } })).not.toContain('km')
  })

  it('still produces a deck when almost everything is missing', () => {
    // The floor: a promise and a finale. Never zero slides, never a blank one.
    const bare = keys({
      ...BASE,
      totals: { ...BASE.totals, km: 0, hours: 0 },
      planned_tss: null, peak_power: null, best_ride: null,
    })
    expect(bare).toEqual(['open', 'finale'])
  })
})

describe('the comparison is against the plan, never an invented last week', () => {
  it('reports the real ratio', () => {
    const plan = buildWrappedVm(BASE).slides.find((s) => s.key === 'plan')
    expect(plan?.versus?.frac).toBeCloseTo(486 / 450, 3)
    expect(plan?.versus?.thisWeek).toContain('486')
    expect(plan?.versus?.lastWeek).toContain('450')
  })

  it('changes its words when the rider fell short', () => {
    const under = buildWrappedVm({ ...BASE, totals: { ...BASE.totals, tss: 300 } })
    const over = buildWrappedVm(BASE)
    const u = under.slides.find((s) => s.key === 'plan')
    const o = over.slides.find((s) => s.key === 'plan')
    expect(u?.accent).not.toEqual(o?.accent)
  })
})

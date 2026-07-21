import { describe, it, expect } from 'vitest'
import { deriveThisWeek, isoWeekKey, type ThisWeekActivity } from '../thisWeek'

// Fixed anchor: Wednesday 15 Jul 2026 (local). Monday of this week = 13 Jul.
// todayIdx for Wednesday = (3 + 6) % 7 = 2.
const WED = new Date(2026, 6, 15, 12, 0, 0)

// Build an activity timestamp at local midday on the given day-of-month in Jul 2026.
const at = (dayOfMonth: number, tss: number): ThisWeekActivity => ({
  started_at: new Date(2026, 6, dayOfMonth, 10, 0, 0).toISOString(),
  tss,
})

describe('isoWeekKey', () => {
  it('anchors every day of a week to the same Monday key', () => {
    const monday = isoWeekKey(new Date(2026, 6, 13))
    for (const d of [13, 14, 15, 16, 17, 18, 19]) {
      expect(isoWeekKey(new Date(2026, 6, d))).toBe(monday)
    }
    // The next Monday starts a new week.
    expect(isoWeekKey(new Date(2026, 6, 20))).not.toBe(monday)
  })
})

describe('deriveThisWeek', () => {
  it('honest empty state with no activities and no plan', () => {
    const m = deriveThisWeek([], null, WED)
    expect(m).toMatchObject({
      tss: 0,
      sessions: 0,
      todayIdx: 2,
      plannedSessions: null,
      plannedWeekTss: null,
      tssLeft: null,
      compliancePct: null,
      complianceOnPace: false,
    })
    expect(m.dayHas).toEqual([false, false, false, false, false, false, false])
  })

  it('sums TSS and marks day-dots for activities in the current week', () => {
    const m = deriveThisWeek([at(13, 60), at(15, 40)], null, WED)
    expect(m.tss).toBe(100)
    expect(m.sessions).toBe(2)
    // Monday (idx 0) and Wednesday (idx 2) logged; the rest empty.
    expect(m.dayHas).toEqual([true, false, true, false, false, false, false])
  })

  it('excludes activities outside the current ISO week', () => {
    // 6 Jul is the previous week; 20 Jul is the next week.
    const m = deriveThisWeek([at(6, 999), at(15, 50), at(20, 999)], null, WED)
    expect(m.tss).toBe(50)
    expect(m.sessions).toBe(1)
  })

  it('derives compliance, sessions and TSS-left from the plan', () => {
    const plan = {
      planned_tss_total: 400,
      days: [
        { category: 'endurance' }, { category: 'rest' }, { category: 'threshold' },
        { category: 'rest' }, { category: 'vo2' }, { category: 'endurance' }, { category: 'rest' },
      ],
    }
    const m = deriveThisWeek([at(13, 100), at(15, 100)], plan, WED)
    expect(m.plannedSessions).toBe(4) // non-rest days
    expect(m.plannedWeekTss).toBe(400)
    expect(m.compliancePct).toBe(50) // 200 / 400
    expect(m.tssLeft).toBe(200)
  })

  it('flags on-pace vs behind against the elapsed fraction of the week', () => {
    const plan = { planned_tss_total: 100, days: [] }
    // Wednesday → elapsed fraction = (2+1)/7 ≈ 42.9%.
    const behind = deriveThisWeek([at(13, 20)], plan, WED) // 20% < 42.9%
    expect(behind.compliancePct).toBe(20)
    expect(behind.complianceOnPace).toBe(false)

    const ahead = deriveThisWeek([at(13, 60)], plan, WED) // 60% ≥ 42.9%
    expect(ahead.compliancePct).toBe(60)
    expect(ahead.complianceOnPace).toBe(true)
  })

  it('never reports negative TSS-left when the week is over-delivered', () => {
    const plan = { planned_tss_total: 100, days: [{ category: 'endurance' }] }
    const m = deriveThisWeek([at(13, 150)], plan, WED)
    expect(m.tssLeft).toBe(0)
    expect(m.compliancePct).toBe(150)
  })
})

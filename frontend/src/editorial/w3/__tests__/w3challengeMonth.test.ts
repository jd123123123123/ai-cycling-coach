import { describe, it, expect } from 'vitest'
import { monthFacts, daysLeftLabel } from '../w3challengeMonth'

describe('monthFacts', () => {
  it('knows how long a month is', () => {
    expect(monthFacts('2026-08').days).toBe(31)
    expect(monthFacts('2026-04').days).toBe(30)
  })

  it('gets February right in both kinds of year', () => {
    expect(monthFacts('2026-02').days).toBe(28)
    expect(monthFacts('2028-02').days).toBe(29)
  })

  it('places today inside the current month', () => {
    const { todayIndex } = monthFacts('2026-08', new Date(2026, 7, 24))
    expect(todayIndex).toBe(24)
  })

  it('has no today in a month that is not this one', () => {
    // A strip for March must not mark a day as today just because today exists.
    expect(monthFacts('2026-03', new Date(2026, 7, 24)).todayIndex).toBe(0)
    expect(monthFacts('2026-12', new Date(2026, 7, 24)).todayIndex).toBe(0)
  })

  it('refuses a period it cannot read rather than inventing a month', () => {
    expect(monthFacts('')).toEqual({ days: 0, todayIndex: 0 })
    expect(monthFacts('2026-13')).toEqual({ days: 0, todayIndex: 0 })
    expect(monthFacts('nonsense')).toEqual({ days: 0, todayIndex: 0 })
  })
})

describe('daysLeftLabel', () => {
  it('counts the days left', () => {
    expect(daysLeftLabel('2026-08', new Date(2026, 7, 24))).toBe('noch 7 Tage')
  })

  it('uses the singular on the second-to-last day', () => {
    expect(daysLeftLabel('2026-08', new Date(2026, 7, 30))).toBe('noch 1 Tag')
  })

  it('names the last day instead of counting zero', () => {
    expect(daysLeftLabel('2026-08', new Date(2026, 7, 31))).toBe('letzter Tag')
  })

  it('says nothing about a month that is not running', () => {
    // "noch 9 Tage" about a month that ended is a lie with a number in it.
    expect(daysLeftLabel('2026-03', new Date(2026, 7, 24))).toBeNull()
  })
})

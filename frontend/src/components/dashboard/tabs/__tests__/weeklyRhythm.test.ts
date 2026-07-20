import { describe, expect, it } from 'vitest'
import { consistencyLabel, fourWeekAvgWeeklyTss, shouldShowFitnessTrendChip } from '../TodayTab'
import { monthVerdict, completedWeekMax } from '../HistoryTab'

describe('consistencyLabel (audit P1-11)', () => {
  it('renders the exact audit copy in both locales', () => {
    expect(consistencyLabel({ met: 3, planned: 5 }, true)).toBe('Konstanz: 3 von 5 geplanten Tagen')
    expect(consistencyLabel({ met: 3, planned: 5 }, false)).toBe('Consistency: 3 of 5 planned days')
  })

  it('hides entirely while consistency is absent or empty', () => {
    expect(consistencyLabel(null, true)).toBeNull()
    expect(consistencyLabel(undefined, false)).toBeNull()
    expect(consistencyLabel({ met: 0, planned: 0 }, true)).toBeNull()
  })

  it('never uses streak vocabulary', () => {
    const label = consistencyLabel({ met: 2, planned: 4 }, true)! + consistencyLabel({ met: 2, planned: 4 }, false)!
    expect(label).not.toMatch(/Serie|streak/i)
  })
})

describe('fourWeekAvgWeeklyTss', () => {
  const days = (n: number, tss: number) => Array.from({ length: n }, () => ({ tss, daily_tss: null }))

  it('null while history is too thin to call an average', () => {
    expect(fourWeekAvgWeeklyTss(undefined)).toBeNull()
    expect(fourWeekAvgWeeklyTss(null)).toBeNull()
    expect(fourWeekAvgWeeklyTss(days(13, 50))).toBeNull()
  })

  it('averages the trailing 28 days into a weekly number', () => {
    expect(fourWeekAvgWeeklyTss(days(28, 50))).toBe(350)
  })

  it('falls back to legacy daily_tss when tss is null', () => {
    const entries = Array.from({ length: 28 }, () => ({ tss: null, daily_tss: 100 }))
    expect(fourWeekAvgWeeklyTss(entries)).toBe(700)
  })
})

describe('shouldShowFitnessTrendChip (audit P1-8)', () => {
  it('never renders without a real trend', () => {
    expect(shouldShowFitnessTrendChip(null, null, null, null)).toBe(false)
  })

  it('rises and flat always render', () => {
    expect(shouldShowFitnessTrendChip(3, 'planned_rest', 100, 400)).toBe(true)
    expect(shouldShowFitnessTrendChip(0, 'recover', 100, 400)).toBe(true)
  })

  it('a decline hides on planned rest / recover days — the dip is the plan working', () => {
    expect(shouldShowFitnessTrendChip(-4, 'planned_rest', null, null)).toBe(false)
    expect(shouldShowFitnessTrendChip(-4, 'recover', null, null)).toBe(false)
  })

  it('a decline hides during a deliberately quiet week (plan materially below 4-week avg)', () => {
    expect(shouldShowFitnessTrendChip(-4, 'quality', 150, 300)).toBe(false)
  })

  it('a real, unplanned decline still renders', () => {
    expect(shouldShowFitnessTrendChip(-4, 'quality', 300, 300)).toBe(true)
    expect(shouldShowFitnessTrendChip(-4, null, null, null)).toBe(true)
  })
})

describe('monthVerdict (audit P1-8)', () => {
  it('a lighter month is neutral muted — never amber or red', () => {
    const v = monthVerdict(800, 8, -20, true, true)
    expect(v.word).toBe('Ruhigerer Monat')
    expect(v.color).toBe('var(--color-muted)')
    expect(v.sentence).toContain('minus 20% ggü. Vormonat')
  })

  it('strong and steady months keep their tones', () => {
    expect(monthVerdict(1200, 14, 15, true, false).color).toBe('var(--color-recovery)')
    expect(monthVerdict(1000, 12, 5, true, false).color).toBe('var(--color-strain)')
  })

  it('no prior month → baseline framing', () => {
    const v = monthVerdict(300, 4, null, false, false)
    expect(v.word).toBe('Building baseline')
    expect(v.sentence).toContain('no prior month to compare yet')
  })

  it('never emits blame vocabulary', () => {
    for (const pct of [-50, -20, -5, 0, 20]) {
      for (const de of [true, false]) {
        const v = monthVerdict(500, 6, pct, true, de)
        expect(`${v.word} ${v.sentence}`).not.toMatch(/Fehler|failure|schlecht|bad month|schwach|weak/i)
      }
    }
  })
})

describe('completedWeekMax (audit P1-8)', () => {
  it('the in-progress week never sets the scale', () => {
    expect(completedWeekMax([{ value: 100 }, { value: 500 }, { value: 40, inProgress: true }])).toBe(500)
    expect(completedWeekMax([{ value: 100 }, { value: 900, inProgress: true }])).toBe(100)
  })

  it('floors at 1 so empty history cannot divide by zero', () => {
    expect(completedWeekMax([{ value: 40, inProgress: true }])).toBe(1)
    expect(completedWeekMax([])).toBe(1)
  })
})

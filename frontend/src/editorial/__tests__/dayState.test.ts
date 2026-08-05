import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearOverride, deriveDayState, isoDateKey, readOverride, writeOverride,
  type DayFacts,
} from '../state/dayState'

const at = (h: number, m = 0) => new Date(2026, 6, 22, h, m) // Wed 22 Jul 2026

const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  now: at(9),
  hasCyclingActivityToday: false,
  hasPlannedSessionToday: false,
  plannedSessionCompleted: false,
  ...over,
})

describe('deriveDayState', () => {
  it('evening wins over everything from 21:00', () => {
    expect(deriveDayState(facts({ now: at(21), hasCyclingActivityToday: true }))).toBe('evening')
    expect(deriveDayState(facts({ now: at(21, 40) }))).toBe('evening')
  })

  it('a recorded ride reads trained right up to 21:00', () => {
    expect(deriveDayState(facts({ now: at(19, 24), hasCyclingActivityToday: true }))).toBe('trained')
    expect(deriveDayState(facts({ now: at(20, 59), hasCyclingActivityToday: true }))).toBe('trained')
  })

  it('a planned, uncompleted session reads training', () => {
    expect(deriveDayState(facts({ hasPlannedSessionToday: true }))).toBe('training')
  })

  it('a planned session already completed but with no activity is not training', () => {
    expect(deriveDayState(facts({
      now: at(15), hasPlannedSessionToday: true, plannedSessionCompleted: true,
    }))).toBe('resting')
  })

  it('no session and past 11:00 reads resting', () => {
    expect(deriveDayState(facts({ now: at(11) }))).toBe('resting')
    expect(deriveDayState(facts({ now: at(10, 59) }))).toBe('rest')
  })

  it('otherwise reads rest', () => {
    expect(deriveDayState(facts({ now: at(6) }))).toBe('rest')
  })
})

describe('override storage', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips for the same day', () => {
    writeOverride('training', at(9))
    expect(readOverride(at(18))).toBe('training')
  })

  it('expires at midnight — a different ISO date does not see it', () => {
    writeOverride('training', at(9))
    expect(readOverride(new Date(2026, 6, 23, 9))).toBeNull()
  })

  it('clears', () => {
    writeOverride('trained', at(9))
    clearOverride()
    expect(readOverride(at(9))).toBeNull()
  })

  it('rejects a stored value that is not a DayState', () => {
    localStorage.setItem('editorial.dayState', JSON.stringify({ date: isoDateKey(at(9)), state: 'brunch' }))
    expect(readOverride(at(9))).toBeNull()
  })
})

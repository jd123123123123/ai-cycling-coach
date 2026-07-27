import { describe, expect, it } from 'vitest'
import { hrvHeadline } from '../HRVTrend'
import { sleepEvidenceScore } from '../SessionOfTheDay'
import { baselineHeadline, type BaselinePoint } from '../../../pages/RecoveryTrendsView'

/**
 * Stale-wearable gates (Jul 2026). Three surfaces picked "the newest row that
 * has this field" with no date check and then captioned it as today's:
 *
 *   • HRVTrend    — a 36px number under a "Innerhalb Baseline" verdict chip
 *   • Trends rows — a headline number under a "Heute"/"Today" axis tick
 *   • Why-this-session — a "Schlaf 78/100" chip in the evidence list
 *
 * Each gate: fresh → unchanged; stale → the withheld / dated path.
 */

const TODAY = '2026-07-27'
const BAND = { lower: 40, upper: 60 }

describe('hrvHeadline', () => {
  it("keeps the verdict when the reading is today's", () => {
    const h = hrvHeadline(
      [{ date: '2026-07-26', hrv_status: 48 }, { date: TODAY, hrv_status: 50 }],
      TODAY,
      BAND,
    )
    expect(h.current).toBe(50)
    expect(h.currentIsToday).toBe(true)
    expect(h.status).toBe('within')
  })

  it('still grades above / below the band on a fresh reading', () => {
    expect(hrvHeadline([{ date: TODAY, hrv_status: 70 }], TODAY, BAND).status).toBe('above')
    expect(hrvHeadline([{ date: TODAY, hrv_status: 30 }], TODAY, BAND).status).toBe('below')
  })

  it('withholds the verdict for a stale reading but keeps the number', () => {
    const h = hrvHeadline([{ date: '2026-07-20', hrv_status: 50 }], TODAY, BAND)
    // The measurement is real and stays on screen…
    expect(h.current).toBe(50)
    // …but nothing is asserted about today; the caller renders the date.
    expect(h.status).toBe('unknown')
    expect(h.currentIsToday).toBe(false)
    expect(h.currentDateKey).toBe('2026-07-20')
  })

  it('treats yesterday as stale too — the band it is graded against is today\'s', () => {
    expect(hrvHeadline([{ date: '2026-07-26', hrv_status: 50 }], TODAY, BAND).status).toBe('unknown')
  })

  it('skips null readings when finding the newest one, and dates that one', () => {
    const h = hrvHeadline(
      [{ date: '2026-07-20', hrv_status: 44 }, { date: '2026-07-25', hrv_status: null }, { date: TODAY, hrv_status: null }],
      TODAY,
      BAND,
    )
    expect(h.current).toBe(44)
    expect(h.currentDateKey).toBe('2026-07-20')
    expect(h.status).toBe('unknown')
  })

  it('has no verdict when there is no reading at all', () => {
    const h = hrvHeadline([], TODAY, BAND)
    expect(h.current).toBeNull()
    expect(h.currentDateKey).toBeNull()
    expect(h.status).toBe('unknown')
  })

  it('has no verdict when the band itself is unknown', () => {
    expect(hrvHeadline([{ date: TODAY, hrv_status: 50 }], TODAY, { lower: null, upper: null }).status)
      .toBe('unknown')
    expect(hrvHeadline([{ date: TODAY, hrv_status: 50 }], TODAY, undefined).status).toBe('unknown')
  })
})

describe('baselineHeadline', () => {
  const pt = (day: string, v: number, today = false): BaselinePoint => ({ v, day, today })

  it("reports today's own value when the day has data", () => {
    const { todayVal, last } = baselineHeadline([
      pt('Saturday, Jul 25', 42),
      pt('Monday, Jul 27', 47, true),
    ])
    expect(todayVal).toBe(47)
    expect(last?.v).toBe(47)
  })

  it('reports no value for today when the tail days are missing', () => {
    // Pre-fix this returned 42 — the last SURVIVING point — under an axis tick
    // reading "Heute" and a highlighted final bar.
    const { todayVal, last } = baselineHeadline([
      pt('Saturday, Jul 18', 39),
      pt('Monday, Jul 20', 42),
    ])
    expect(todayVal).toBeNull()
    expect(last).toEqual({ v: 42, day: 'Monday, Jul 20', today: false })
  })

  it('reports nothing at all for an empty series', () => {
    expect(baselineHeadline([])).toEqual({ todayVal: null, last: null })
  })

  it("does not confuse an out-of-order today flag with the newest reading", () => {
    // Defensive: today is the last calendar slot by construction, but the
    // headline must key off the flag, never the position.
    const { todayVal } = baselineHeadline([pt('Monday, Jul 27', 47, true)])
    expect(todayVal).toBe(47)
  })
})

describe('sleepEvidenceScore', () => {
  it("lists today's sleep score as an input to today's session", () => {
    expect(sleepEvidenceScore({ date: TODAY, sleep_score: 78 }, TODAY)).toBe(78)
  })

  it('drops a stale score rather than presenting it as a weighed input', () => {
    expect(sleepEvidenceScore({ date: '2026-07-18', sleep_score: 78 }, TODAY)).toBeNull()
  })

  it("drops yesterday's score too — the chip claims today's decision", () => {
    expect(sleepEvidenceScore({ date: '2026-07-26', sleep_score: 78 }, TODAY)).toBeNull()
  })

  it('handles a today row that carries HRV but no sleep score', () => {
    expect(sleepEvidenceScore({ date: TODAY, sleep_score: null }, TODAY)).toBeNull()
  })

  it('handles a missing row and a dateless row', () => {
    expect(sleepEvidenceScore(null, TODAY)).toBeNull()
    expect(sleepEvidenceScore({ sleep_score: 78 }, TODAY)).toBeNull()
  })
})

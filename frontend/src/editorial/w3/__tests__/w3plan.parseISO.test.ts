import { describe, it, expect } from 'vitest'
import { parseISO } from '../w3plan'
import type { WeeklyRecap } from '../../../api/weeklyRecap'
import { recapHasStory } from '../useWeekReviewVm'

/**
 * `parseISO` is called from twenty places across the app, several of them in
 * components that mount on EVERY `/e/w3-*` screen. It took `d.slice(0, 10)`
 * with no guard, so one missing date anywhere in any payload did not blank one
 * card — it threw through the whole render tree and replaced the entire app
 * with the error card. A date is exactly the field a partial or older payload
 * is most likely to be missing.
 */
describe('parseISO · a missing date must not take the app down', () => {
  it('still reads a real date', () => {
    const d = parseISO('2026-08-17')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(17)
  })

  it('accepts a full timestamp, using its date half', () => {
    expect(parseISO('2026-08-17T09:30:00Z').getDate()).toBe(17)
  })

  for (const bad of [undefined, null, '', 'nonsense', 42, {}]) {
    it(`returns an invalid Date rather than throwing for ${JSON.stringify(bad)}`, () => {
      const d = parseISO(bad as never)
      expect(() => d.getTime()).not.toThrow()
      expect(Number.isNaN(d.getTime())).toBe(true)
    })
  }
})

describe('the weekly-review gate · a partial recap must not take the app down', () => {
  // This gate mounts on every `/e/w3-*` route, so a throw here is not a broken
  // card — it is a broken app, on every screen, until the payload changes.
  it('says no when the recap carries no totals at all', () => {
    expect(() => recapHasStory({ week_start: '2026-08-17' } as unknown as WeeklyRecap)).not.toThrow()
    expect(recapHasStory({ week_start: '2026-08-17' } as unknown as WeeklyRecap)).toBe(false)
  })

  it('still offers a week that has a story', () => {
    expect(recapHasStory({
      week_start: '2026-08-17', totals: { sessions: 3 }, planned_tss: 0,
    } as unknown as WeeklyRecap)).toBe(true)
  })

  it('offers a week with no rides but a plan that was missed', () => {
    expect(recapHasStory({
      week_start: '2026-08-17', totals: { sessions: 0 }, planned_tss: 300,
    } as unknown as WeeklyRecap)).toBe(true)
  })
})

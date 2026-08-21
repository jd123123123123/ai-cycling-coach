import { describe, it, expect } from 'vitest'
import { isWeekStart } from '../W3WeekRecapCard'

/**
 * The week-review call-to-action leads on the days a rider is still thinking
 * about the week that just ended.
 */
describe('isWeekStart', () => {
  const on = (iso: string) => isWeekStart(new Date(`${iso}T09:00:00`))

  it('leads Monday through Wednesday', () => {
    expect(on('2026-08-17')).toBe(true) // Mon
    expect(on('2026-08-18')).toBe(true) // Tue
    expect(on('2026-08-19')).toBe(true) // Wed
  })

  it('goes quiet from Thursday on', () => {
    expect(on('2026-08-20')).toBe(false) // Thu
    expect(on('2026-08-22')).toBe(false) // Sat
  })

  it('does not count Sunday as a new week', () => {
    // THE OFF-BY-ONE. `getDay()` is 0 for Sunday, so a naive `d <= 3` makes
    // Sunday a week START — and Sunday belongs to the week that is ENDING. A
    // rider would get "look back at last week" on the day they are still riding
    // it.
    expect(on('2026-08-23')).toBe(false)
  })
})

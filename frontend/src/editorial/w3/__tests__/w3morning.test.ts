import { describe, it, expect, beforeEach } from 'vitest'
import { isMorning, morningDayKey, MORNING_FROM_HOUR, MORNING_UNTIL_HOUR } from '../w3morning'
import { claimGate, releaseGate, gateHolder, resetGates } from '../w3gates'

describe('when the briefing is allowed to appear', () => {
  const at = (h: number) => new Date(2026, 7, 27, h, 30)

  it('covers the hours a rider actually starts a day in', () => {
    expect(isMorning(at(MORNING_FROM_HOUR))).toBe(true)
    expect(isMorning(at(7))).toBe(true)
    expect(isMorning(at(MORNING_UNTIL_HOUR - 1))).toBe(true)
  })

  it('never says "Guten Morgen" in the afternoon', () => {
    /** A greeting that lands at 16:00 is a bug the rider can read. A rider who
     *  only ever opens the app after lunch simply never gets one — by then the
     *  Today screen is a better answer than a summary of it. */
    expect(isMorning(at(MORNING_UNTIL_HOUR))).toBe(false)
    expect(isMorning(at(16))).toBe(false)
    expect(isMorning(at(23))).toBe(false)
  })

  it('does not fire in the middle of the night', () => {
    expect(isMorning(at(1))).toBe(false)
    expect(isMorning(at(MORNING_FROM_HOUR - 1))).toBe(false)
  })
})

describe('the once-a-day key', () => {
  it('is the LOCAL calendar day', () => {
    /** UTC would roll over mid-evening for anyone west of Greenwich: they would
     *  be handed tomorrow's briefing tonight and nothing in the morning. */
    expect(morningDayKey(new Date(2026, 7, 27, 6, 0))).toBe('ridr.morning.2026-08-27')
    expect(morningDayKey(new Date(2026, 0, 5, 23, 59))).toBe('ridr.morning.2026-01-05')
  })

  it('changes at midnight and not before', () => {
    const a = morningDayKey(new Date(2026, 7, 27, 23, 59))
    const b = morningDayKey(new Date(2026, 7, 28, 0, 1))
    expect(a).not.toBe(b)
    expect(morningDayKey(new Date(2026, 7, 27, 6, 0))).toBe(a)
  })
})

describe('one interruption per app open', () => {
  beforeEach(resetGates)

  it('gives the launch to whoever asks first', () => {
    expect(claimGate('morning')).toBe(true)
    expect(claimGate('setup')).toBe(false)
    expect(claimGate('weekReview')).toBe(false)
    expect(gateHolder()).toBe('morning')
  })

  it('lets the holder re-ask without locking itself out', () => {
    expect(claimGate('morning')).toBe(true)
    expect(claimGate('morning')).toBe(true)
  })

  it('frees the launch when a sheet is dismissed', () => {
    /** Otherwise one dismissed sheet silences every other gate for the rest of
     *  the session, which is a worse bug than the stacking it prevents. */
    claimGate('morning')
    releaseGate('morning')
    expect(gateHolder()).toBeNull()
    expect(claimGate('setup')).toBe(true)
  })

  it('ignores a release from someone who does not hold it', () => {
    claimGate('morning')
    releaseGate('setup')
    expect(gateHolder()).toBe('morning')
  })
})

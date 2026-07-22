import { describe, expect, it } from 'vitest'
import { hasTodayOvernightRecovery, isReadinessPending } from '../TodayTab'

// readiness-timing fix (Jul 2026): the Bereitschaft card must not present a
// fresh score before today's OVERNIGHT recovery data has landed. At local
// midnight the training day rolls over but the athlete hasn't slept yet.

const TODAY = '2026-07-22'
const YEST = '2026-07-21'

describe('hasTodayOvernightRecovery', () => {
  it('true when a metric dated to today carries an overnight signal', () => {
    expect(hasTodayOvernightRecovery([{ date: TODAY, sleep_score: 82 }], TODAY)).toBe(true)
    expect(hasTodayOvernightRecovery([{ date: TODAY, hrv_status: 71 }], TODAY)).toBe(true)
    expect(hasTodayOvernightRecovery([{ date: TODAY, resting_hr: 48 }], TODAY)).toBe(true)
  })

  it('false when the newest recovery metric is a PRIOR local day (no overnight yet)', () => {
    // Yesterday's morning sync must NOT count as today's readiness.
    expect(
      hasTodayOvernightRecovery(
        [
          { date: YEST, sleep_score: 80, hrv_status: 73, resting_hr: 49 },
          { date: TODAY, sleep_score: null, hrv_status: null, resting_hr: null },
        ],
        TODAY,
      ),
    ).toBe(false)
  })

  it('false when today has a row but no overnight signal on it', () => {
    expect(hasTodayOvernightRecovery([{ date: TODAY, steps: 1200 } as never], TODAY)).toBe(false)
  })

  it('false for empty / missing metrics', () => {
    expect(hasTodayOvernightRecovery([], TODAY)).toBe(false)
    expect(hasTodayOvernightRecovery(null, TODAY)).toBe(false)
    expect(hasTodayOvernightRecovery(undefined, TODAY)).toBe(false)
  })
})

describe('isReadinessPending', () => {
  const base = { hasTodayOvernight: false, hasRecoveryHistory: true, trainedToday: false, sidelined: false }

  it('PENDING on a new day whose overnight sync has not landed yet', () => {
    expect(isReadinessPending(base)).toBe(true)
  })

  it('NOT pending once today has overnight data (normal morning → real score)', () => {
    expect(isReadinessPending({ ...base, hasTodayOvernight: true })).toBe(false)
  })

  it('NOT pending for an athlete with no wearable history (keep the empty "—" state)', () => {
    expect(isReadinessPending({ ...base, hasRecoveryHistory: false })).toBe(false)
  })

  it('NOT pending after a late/early session — the post-ride review shows instead', () => {
    expect(isReadinessPending({ ...base, trainedToday: true })).toBe(false)
  })

  it('NOT pending when sidelined — that card carries its own reason', () => {
    expect(isReadinessPending({ ...base, sidelined: true })).toBe(false)
  })
})

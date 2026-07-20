import { describe, expect, it } from 'vitest'
import {
  buildAcceptPayload,
  buildConnectPayload,
  duelColumnHeaders,
  isEarlyWeek,
  numOrNull,
  pickPersonalTargets,
  readPaceTss,
  readRowTargetTss,
  resolveCrewInfo,
} from '../socialLogic'

// Monday 2026-07-13T00:00:00Z as the running week's start.
const WEEK_START = '2026-07-13T00:00:00Z'
const dayMs = 86_400_000
const at = (dayOffset: number) => new Date(WEEK_START).getTime() + dayOffset * dayMs

describe('isEarlyWeek (audit P1-10: no 0:60 losing scoreboard on Monday)', () => {
  it('Monday/Tuesday/Wednesday are always early-week', () => {
    expect(isEarlyWeek(WEEK_START, at(0), 500, 100)).toBe(true)
    expect(isEarlyWeek(WEEK_START, at(1), 500, 100)).toBe(true)
    expect(isEarlyWeek(WEEK_START, at(2.5), 500, 100)).toBe(true)
  })

  it('from Thursday it is no longer early once ≥40% of last week is banked', () => {
    expect(isEarlyWeek(WEEK_START, at(3), 80, 200)).toBe(false) // 40% exactly
    expect(isEarlyWeek(WEEK_START, at(5), 300, 200)).toBe(false)
  })

  it('stays early past Thursday while own total < 40% of last week final', () => {
    expect(isEarlyWeek(WEEK_START, at(4), 79, 200)).toBe(true)
  })

  it('a zero last week never divides by itself into a stuck early state', () => {
    expect(isEarlyWeek(WEEK_START, at(4), 0, 0)).toBe(false)
  })

  it('missing/garbage week start falls back to the 40% rule alone', () => {
    expect(isEarlyWeek(undefined, at(0), 10, 200)).toBe(true)
    expect(isEarlyWeek('not-a-date', at(0), 79, 200)).toBe(true)
    expect(isEarlyWeek(undefined, at(0), 100, 200)).toBe(false)
  })
})

describe('pickPersonalTargets (athlete-scaled, never hardcoded 800/7)', () => {
  it('prefers the landed backend fields (weekly_target_tss / active_days_target)', () => {
    const t = pickPersonalTargets({
      weekly_target_tss: 315,
      active_days_target: 3,
      you_last_week: { tss: 900 },
    })
    expect(t.loadTargetTss).toBe(315)
    expect(t.activeDaysTarget).toBe(3)
  })

  it('accepts a nested personal_targets object too', () => {
    const t = pickPersonalTargets({
      personal_targets: { weekly_tss: 280, active_days: 5 },
    })
    expect(t.loadTargetTss).toBe(280)
    expect(t.activeDaysTarget).toBe(5)
  })

  it('tolerates alternate backend field names', () => {
    expect(pickPersonalTargets({ targets: { weekly_load_tss: 220 } }).loadTargetTss).toBe(220)
    expect(pickPersonalTargets({ weekly_load_target: 250 }).loadTargetTss).toBe(250)
    expect(pickPersonalTargets({ targets: { weekly_active_days: 5 } }).activeDaysTarget).toBe(5)
  })

  it('falls back to last week ×1.05 while the backend field has not landed', () => {
    const t = pickPersonalTargets({ you_last_week: { tss: 200 } })
    expect(t.loadTargetTss).toBe(210)
  })

  it('with no basis at all: NO load target (null) and 3-4 default days — never 800/7', () => {
    const t = pickPersonalTargets(undefined)
    expect(t.loadTargetTss).toBeNull()
    expect(t.activeDaysTarget).toBe(4)
    const zero = pickPersonalTargets({ you_last_week: { tss: 0 } })
    expect(zero.loadTargetTss).toBeNull()
    expect(zero.activeDaysTarget).not.toBe(7)
  })

  it('clamps a nonsense days target into 1..7', () => {
    expect(pickPersonalTargets({ personal_targets: { active_days: 25 } }).activeDaysTarget).toBe(7)
  })
})

describe('readPaceTss (last_week_at_now, tolerant of shape)', () => {
  it('reads a bare number', () => {
    expect(readPaceTss({ last_week_at_now: 128 })).toBe(128)
  })

  it('reads a stats-object shape', () => {
    expect(readPaceTss({ last_week_at_now: { tss: 96.4 } })).toBe(96.4)
  })

  it('reads the alternate field name and returns null when absent', () => {
    expect(readPaceTss({ you_last_week_at_now: 50 })).toBe(50)
    expect(readPaceTss({})).toBeNull()
    expect(readPaceTss(undefined)).toBeNull()
    expect(readPaceTss({ last_week_at_now: 'NaN-ish' })).toBeNull()
  })
})

describe('duelColumnHeaders (never DU / DU)', () => {
  it('self-duel headers are week columns in both locales', () => {
    expect(duelColumnHeaders(true, true, 'whoever')).toEqual({ you: 'DIESE WO.', opp: 'LETZTE WO.' })
    expect(duelColumnHeaders(true, false, 'whoever')).toEqual({ you: 'THIS WK', opp: 'LAST WK' })
  })

  it('self-duel columns are never identical', () => {
    for (const de of [true, false]) {
      const c = duelColumnHeaders(true, de, 'Du')
      expect(c.you).not.toBe(c.opp)
    }
  })

  it('real rivals keep DU/YOU vs their handle', () => {
    expect(duelColumnHeaders(false, true, 'Luca')).toEqual({ you: 'DU', opp: 'LUCA' })
    expect(duelColumnHeaders(false, false, 'Luca')).toEqual({ you: 'YOU', opp: 'LUCA' })
  })
})

describe('connect/accept payloads (crew-challenge entry is opt-in)', () => {
  it('connect sends the flag explicitly under both names — false when unchecked', () => {
    expect(buildConnectPayload(7, false)).toEqual({
      user_id: 7, invite_to_challenge: false, join_challenges: false,
    })
  })

  it('true only after the athlete checks the box', () => {
    expect(buildConnectPayload(7, true)).toEqual({
      user_id: 7, invite_to_challenge: true, join_challenges: true,
    })
  })

  it('accept-mine carries the landed join_challenges flag, default-false semantics', () => {
    expect(buildAcceptPayload(false)).toEqual({ join_challenges: false })
    expect(buildAcceptPayload(true)).toEqual({ join_challenges: true })
  })
})

describe('resolveCrewInfo (one unambiguous crew state)', () => {
  it('an existing crew reports name + member count', () => {
    const info = resolveCrewInfo(
      { crew: { id: 1, name: 'Maratona Squad' }, members: [{}, {}, {}] },
      2,
    )
    expect(info).toEqual({ exists: true, name: 'Maratona Squad', memberCount: 3 })
  })

  it('prefers an explicit backend member_count when it lands', () => {
    const info = resolveCrewInfo({ crew: { name: 'Squad', member_count: 5 }, members: [{}] }, 0)
    expect(info.memberCount).toBe(5)
  })

  it('falls back to the duel roster when /crews/me lags behind', () => {
    const info = resolveCrewInfo({ crew: null, members: [] }, 2)
    expect(info.exists).toBe(true)
    expect(info.memberCount).toBe(3) // 2 crewmates + you
  })

  it('no crew anywhere → a single honest empty state', () => {
    expect(resolveCrewInfo({ crew: null, members: [] }, 0)).toEqual({ exists: false, name: null, memberCount: 0 })
    expect(resolveCrewInfo(undefined, 0).exists).toBe(false)
  })
})

describe('readRowTargetTss / numOrNull', () => {
  it('reads the per-rider weekly target when present, null before it lands', () => {
    expect(readRowTargetTss({ weekly_target_tss: 240 })).toBe(240)
    expect(readRowTargetTss({ target_tss: '180' })).toBe(180)
    expect(readRowTargetTss({ handle: 'x' })).toBeNull()
  })

  it('numOrNull coerces finite numbers only', () => {
    expect(numOrNull('42')).toBe(42)
    expect(numOrNull(Infinity)).toBeNull()
    expect(numOrNull('')).toBeNull()
    expect(numOrNull(null)).toBeNull()
  })
})

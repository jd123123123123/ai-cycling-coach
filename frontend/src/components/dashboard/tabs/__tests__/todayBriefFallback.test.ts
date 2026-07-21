import { describe, expect, it } from 'vitest'
import { briefFallbackState } from '../TodayTab'

/**
 * Finding #1 (BLOCKER): a failed /coach/brief must NEVER become a fabricated
 * rest day. The fallback is week-plan-honest: planned session → show it,
 * week-plan rest → factual rest, nothing → degraded + retry.
 */
describe('briefFallbackState', () => {
  const base = {
    briefFailed: false,
    briefLoaded: false,
    decisionState: null as string | null,
    hasWorkout: false,
    weekTodayHasWork: null as boolean | null,
  }

  it('is "none" while everything is still loading — no verdicts from silence', () => {
    expect(briefFallbackState(base)).toBe('none')
  })

  it('is "none" whenever a decision or a prescription exists (normal paths)', () => {
    expect(briefFallbackState({ ...base, briefFailed: true, decisionState: 'quality' })).toBe('none')
    expect(briefFallbackState({ ...base, briefLoaded: true, hasWorkout: true })).toBe('none')
    expect(briefFallbackState({ ...base, briefFailed: true, decisionState: 'planned_rest' })).toBe('none')
  })

  it('brief 500 + week plan has a session → planned_session, NEVER rest', () => {
    expect(
      briefFallbackState({ ...base, briefFailed: true, weekTodayHasWork: true }),
    ).toBe('planned_session')
  })

  it('brief 500 + week plan says today is rest → planned_rest (the plan itself says so)', () => {
    expect(
      briefFallbackState({ ...base, briefFailed: true, weekTodayHasWork: false }),
    ).toBe('planned_rest')
  })

  it('brief 500 + no week data at all → degraded (honest error state)', () => {
    expect(briefFallbackState({ ...base, briefFailed: true })).toBe('degraded')
  })

  it('brief loaded EMPTY (no decision, no workout) follows the same week-honest chain', () => {
    expect(briefFallbackState({ ...base, briefLoaded: true, weekTodayHasWork: true })).toBe('planned_session')
    expect(briefFallbackState({ ...base, briefLoaded: true, weekTodayHasWork: false })).toBe('planned_rest')
    expect(briefFallbackState({ ...base, briefLoaded: true })).toBe('degraded')
  })
})

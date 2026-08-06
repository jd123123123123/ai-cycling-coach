import { describe, expect, it } from 'vitest'
import { buildSessionModel, type SessionModelInputs } from '../data/useSessionModel'
import { isPresent } from '../data/value'

const base = (over: Partial<SessionModelInputs> = {}): SessionModelInputs => ({
  now: new Date(2026, 6, 22, 9, 0),
  workout: null,
  brief: undefined,
  isLoading: false,
  ...over,
})

describe('buildSessionModel', () => {
  it('marks whatThisChanges missing when the brief has neither adaptations nor a post-ride review', () => {
    const m = buildSessionModel(base({
      brief: { adaptations: null, post_ride_review: null } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(false)
    expect(m.whatThisChanges).toEqual({ missing: 'Der Coach hat sich zu dieser Fahrt noch nicht geäußert.' })
  })

  it('splits whatThisChanges into the ON YOU and ON THE PLAN claims from real, distinct fields', () => {
    const m = buildSessionModel(base({
      brief: {
        adaptations: { summary: 'Thursday VO2 targets rise 10 W', changes: [] },
        post_ride_review: { physiological_read: 'Threshold moves to 288 W', goal_trajectory: 'trending up', next_session_nudge: 'Tomorrow stays easy.' },
      } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(true)
    if (isPresent(m.whatThisChanges)) {
      expect(m.whatThisChanges.value.onYou.claim).toBe('Threshold moves to 288 W')
      expect(m.whatThisChanges.value.onThePlan.claim).toBe('Thursday VO2 targets rise 10 W')
    }
  })

  // ---- Bug fix (2026-08-06): same defect, same fix as useTodayModel.ts's ---
  // own whatThisChanges (commit 5f98a62). Reproduces the real state this was
  // found in: a session that hasn't been ridden yet (no post-ride review,
  // the ordinary case for Session Detail — the athlete is looking at a
  // session BEFORE riding it) with adaptations present but no per-signal
  // changes. The old fallback let `onYou` silently borrow
  // `adaptations.summary` — the exact same string `onThePlan` shows — so ON
  // YOU and ON THE PLAN printed identical text under two different labels.
  it('never duplicates the plan summary under ON YOU when there is nothing distinct to say about the athlete yet', () => {
    const m = buildSessionModel(base({
      brief: {
        adaptations: { summary: 'Thursday VO2 targets rise 10 W', changes: [] },
        post_ride_review: null,
      } as never,
    }))
    // Honestly missing, not a duplicate — never { onYou: same text, onThePlan: same text }.
    expect(isPresent(m.whatThisChanges)).toBe(false)
  })

  it('DOES populate ON YOU from a real per-signal change, distinct from the plan summary', () => {
    const m = buildSessionModel(base({
      brief: {
        adaptations: {
          summary: 'Signals steady since yesterday — the plan follows the periodized build.',
          changes: [{ signal: 'hrv', direction: 'down', detail: 'HRV dipped 6% this week.', action: 'Ease tomorrow.', principle: 'Absorb before adding.', severity: 'ease' }],
        },
        post_ride_review: null,
      } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(true)
    if (isPresent(m.whatThisChanges)) {
      expect(m.whatThisChanges.value.onYou.claim).toBe('HRV dipped 6% this week.')
      expect(m.whatThisChanges.value.onThePlan.claim).toBe('Signals steady since yesterday — the plan follows the periodized build.')
      expect(m.whatThisChanges.value.onYou.claim).not.toBe(m.whatThisChanges.value.onThePlan.claim)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { patchBriefWorkoutFromModify, type ModifyResult } from '../SessionOfTheDay'

/**
 * Regression for the reported "I cannot change trainings, it won't adapt" bug.
 *
 * Root cause: after POST /workouts/today/modify the client used to invalidate
 * the coach brief and refetch it — but the server brief read-path can hang or
 * return a null prescribed_workout right after a plan mutation (it busts the
 * cached brief, then blocks on LLM regeneration), which blanked/reverted the
 * just-adapted card. The fix treats the modify RESPONSE as authoritative and
 * patches the cached brief directly (no brief refetch). These tests pin that
 * patch so the card provably shows the new title / duration / TSS instantly.
 */

const brief = (over: Record<string, unknown> = {}) => ({
  verdict: 'Quality day',
  prescribed_workout: {
    template_id: 'sweetspot_3x20',
    title: 'Sweetspot 3×20',
    title_de: 'Sweetspot 3×20',
    duration_minutes: 75,
    predicted_tss: 95,
    blocks: [{ name: 'SST', zone: 3, duration_s: 1200 }],
  },
  ...over,
})

const shortenResult: ModifyResult = {
  success: true,
  reason: 'shortened to fit the day',
  title: 'Tempo 3×10',
  duration_min: 45,
  predicted_tss: 58,
  template_id: 'tempo_3x10',
}

describe('patchBriefWorkoutFromModify', () => {
  it('applies the modify response so the card shows the NEW session', () => {
    const patched = patchBriefWorkoutFromModify(brief(), shortenResult) as ReturnType<typeof brief>
    const w = patched.prescribed_workout
    expect(w.title).toBe('Tempo 3×10')
    expect(w.duration_minutes).toBe(45)
    expect(w.predicted_tss).toBe(58)
    expect(w.template_id).toBe('tempo_3x10')
  })

  it('nulls the German template title so the new English title is not masked', () => {
    const patched = patchBriefWorkoutFromModify(brief(), shortenResult) as ReturnType<typeof brief>
    expect(patched.prescribed_workout.title_de).toBeNull()
  })

  it('drops the stale interval blocks — a shortened session no longer matches them', () => {
    const patched = patchBriefWorkoutFromModify(brief(), shortenResult) as ReturnType<typeof brief>
    expect(patched.prescribed_workout.blocks).toEqual([])
  })

  it('preserves untouched brief fields (verdict, etc.)', () => {
    const patched = patchBriefWorkoutFromModify(brief(), shortenResult) as ReturnType<typeof brief>
    expect(patched.verdict).toBe('Quality day')
  })

  it('returns the same reference when the brief carries no workout (nothing to patch)', () => {
    const bare = { verdict: 'Rest day', prescribed_workout: null }
    expect(patchBriefWorkoutFromModify(bare, shortenResult)).toBe(bare)
    expect(patchBriefWorkoutFromModify(undefined, shortenResult)).toBeUndefined()
  })

  it('patches only the fields the response carries (partial rails downgrade)', () => {
    const easierOnly: ModifyResult = { success: true, reason: 'eased one step', predicted_tss: 70 }
    const patched = patchBriefWorkoutFromModify(brief(), easierOnly) as ReturnType<typeof brief>
    expect(patched.prescribed_workout.predicted_tss).toBe(70)
    // title/duration untouched when the response omits them
    expect(patched.prescribed_workout.title).toBe('Sweetspot 3×20')
    expect(patched.prescribed_workout.duration_minutes).toBe(75)
  })
})

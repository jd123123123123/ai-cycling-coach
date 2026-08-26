import { describe, it, expect } from 'vitest'
import type { WeekResponse } from '../../../api/weeks'
import { hasPlanFromWeek } from '../w3hasPlan'
import { composeWorkout, composedBars, W3_FEELS, W3_MINUTES } from '../w3composeWorkout'
import { blockDuration, estimateDuration } from '../../../api/customWorkouts'

// A `/weeks/current` payload with only the fields the rule reads. The real one
// carries thirty more; none of them are evidence of a plan.
function week(over: Partial<WeekResponse>): WeekResponse {
  return {
    week_start: '2026-08-24', week_end: '2026-08-30',
    // NOT nullable in the schema — api/weeks.py builds one for every athlete,
    // which is the whole reason it cannot be the signal.
    meso_block: { phase: 'base', block_position: 'accumulation', block_index_in_meso: 1 },
    days: [], planned_tss_total: null,
    ...over,
  } as unknown as WeekResponse
}

const day = (over: Record<string, unknown>) => ({
  date: '2026-08-26', sport: 'cycling', title: '', template_id: null,
  duration_seconds_target: null, target_tss: null, category: 'rest',
  intervals: [], rationale: '', is_today: true,
  secondary_title: null, secondary_target_tss: null,
  ...over,
})

describe('hasPlanFromWeek — the rule that could never say no', () => {
  it('is false for the shape every unplanned athlete actually gets', () => {
    // The regression this exists for: a meso block is present, so the old
    // `meso != null` read true here and Today never showed its no-plan branch.
    expect(hasPlanFromWeek(week({}))).toBe(false)
  })

  it('is false before the week has loaded', () => {
    expect(hasPlanFromWeek(null)).toBe(false)
    expect(hasPlanFromWeek(undefined)).toBe(false)
  })

  it('is false for a week of bare rest rows', () => {
    expect(hasPlanFromWeek(week({ days: [day({}), day({})] as never }))).toBe(false)
  })

  it('is true once the week carries planned load', () => {
    expect(hasPlanFromWeek(week({ planned_tss_total: 412 }))).toBe(true)
  })

  it('is true for a prescribed day the estimator could not price', () => {
    expect(hasPlanFromWeek(week({
      days: [day({ category: 'threshold', template_id: 'thr_4x8' })] as never,
    }))).toBe(true)
  })

  it('does not count a rest day that carries a duration', () => {
    expect(hasPlanFromWeek(week({
      days: [day({ category: 'rest', duration_seconds_target: 1800 })] as never,
    }))).toBe(false)
  })
})

describe('composeWorkout', () => {
  it('lasts as long as the button the rider pressed', () => {
    // Every combination, because the failure mode is a shape whose reps do not
    // divide the middle and quietly returns 71 minutes for "90 min".
    for (const f of W3_FEELS) {
      for (const m of W3_MINUTES) {
        const { blocks } = composeWorkout(f.key, m)
        expect(Math.round(estimateDuration(blocks) / 60), `${f.key} ${m}`).toBe(m)
      }
    }
  })

  it('always opens with a warm-up and closes with a cool-down', () => {
    for (const f of W3_FEELS) {
      const { blocks } = composeWorkout(f.key, 60)
      expect(blocks[0].type).toBe('warmup')
      expect(blocks[blocks.length - 1].type).toBe('cooldown')
    }
  })

  it('gives a 45-minute session real work, not two ramps', () => {
    const { blocks } = composeWorkout('intervalle', 45)
    const work = blocks.find((b) => b.type === 'interval')
    expect(work).toBeDefined()
    expect(blockDuration(work!)).toBeGreaterThan(0)
  })

  it('keeps an opener an opener at every length', () => {
    // Scaling this one with the slider would turn a 15-minute activation into
    // an hour of sprints under a word that promises the opposite.
    for (const m of W3_MINUTES) {
      const { blocks } = composeWorkout('oeffnen', m)
      expect(blocks.find((b) => b.type === 'interval')?.reps).toBe(3)
    }
  })

  it('rolls easy when the rider asked to roll easy', () => {
    const { blocks } = composeWorkout('locker', 90)
    expect(blocks.some((b) => b.type === 'interval')).toBe(false)
    expect(blocks.find((b) => b.type === 'steady')?.power_pct).toBeLessThan(0.75)
  })

  it('names itself after what was chosen', () => {
    expect(composeWorkout('berge', 90).name).toBe('Berge · 90 min')
  })
})

describe('composedBars', () => {
  it('draws every rep of a set, on and off', () => {
    const { blocks } = composeWorkout('intervalle', 90)
    const reps = blocks.find((b) => b.type === 'interval')!.reps!
    const bars = composedBars(blocks)
    expect(bars.filter((b) => b.work).length).toBeGreaterThanOrEqual(reps)
  })

  it('measures every session against ONE ceiling', () => {
    // Normalising per workout would draw a recovery ride's 62 % at full height
    // and make "locker" look exactly like "intervalle".
    const easy = Math.max(...composedBars(composeWorkout('locker', 60).blocks).map((b) => b.w))
    const hard = Math.max(...composedBars(composeWorkout('intervalle', 60).blocks).map((b) => b.w))
    expect(hard).toBeGreaterThan(easy)
    expect(hard).toBeLessThanOrEqual(1)
  })

  it('never emits a bar taller than the strip', () => {
    for (const f of W3_FEELS) {
      for (const b of composedBars(composeWorkout(f.key, 120).blocks)) {
        expect(b.w).toBeGreaterThan(0)
        expect(b.w).toBeLessThanOrEqual(1)
      }
    }
  })
})

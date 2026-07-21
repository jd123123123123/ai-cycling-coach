import { describe, it, expect } from 'vitest'
import { computeAlignment, alignLabel, changeLine } from '../SessionReviewCard'
import type { CompliancePair, PostRideReview } from '../../../api/coach'

const pair = (target: number, actual: number, delta_pct: number, band: CompliancePair['band']): CompliancePair =>
  ({ target, actual, delta_pct, band })

const review = (duration: CompliancePair, tss: CompliancePair, intensity_factor?: CompliancePair | null): PostRideReview =>
  ({
    grade: null,
    headline: 'x',
    duration,
    tss,
    intensity_factor: intensity_factor ?? null,
    physiological_read: '',
    goal_trajectory: '',
    next_session_nudge: '',
    target_template_id: '',
    target_template_title: 'Tempo',
    session_type: 'endurance',
  })

describe('computeAlignment', () => {
  it('is 100% and match when every dimension is on target', () => {
    const a = computeAlignment([pair(60, 60, 0, 'match'), pair(50, 50, 0, 'match')])
    expect(a).toEqual({ pct: 100, dir: 'match' })
  })

  it('averages per-metric adherence = clamp(100-|Δ%|) across scored pairs', () => {
    // duration +20% → 80, tss +40% → 60 ⇒ mean 70; net positive ⇒ over
    const a = computeAlignment([pair(60, 72, 20, 'over'), pair(50, 70, 40, 'over')])
    expect(a).toEqual({ pct: 70, dir: 'over' })
  })

  it('classifies a net shortfall as under (never red), clamping big misses to 0', () => {
    const a = computeAlignment([pair(60, 30, -50, 'under'), pair(50, 10, -120, 'under')])
    // -50 → 50, -120 → clamp(100-120,0,100)=0 ⇒ mean 25, under
    expect(a).toEqual({ pct: 25, dir: 'under' })
  })

  it('ignores pairs with no prescribed target', () => {
    expect(computeAlignment([pair(0, 40, 0, 'match'), null, undefined])).toBeNull()
  })
})

describe('alignLabel', () => {
  it('reads no-guilt in both locales', () => {
    expect(alignLabel('match', true)).toBe('genau nach Plan')
    expect(alignLabel('over', true)).toBe('etwas drüber')
    expect(alignLabel('under', true)).toBe('etwas darunter')
    expect(alignLabel('under', false)).toBe('a touch under')
  })
})

describe('changeLine', () => {
  it('says "right on plan" when every dimension lands on target', () => {
    expect(changeLine(review(pair(60, 60, 0, 'match'), pair(50, 50, 0, 'match')), true))
      .toBe('Genau nach Plan — punktgenau getroffen.')
  })

  it('spells out both comparatives with a single trailing clause', () => {
    expect(changeLine(review(pair(60, 80, 33, 'over'), pair(50, 62, 24, 'over')), true))
      .toBe('20 Min länger und 12 TSS mehr als empfohlen.')
    expect(changeLine(review(pair(60, 80, 33, 'over'), pair(50, 62, 24, 'over')), false))
      .toBe('20 min longer and 12 TSS more than prescribed.')
  })

  it('names the spot-on dimension separately when only one dimension drifts', () => {
    expect(changeLine(review(pair(60, 60, 0, 'match'), pair(50, 40, -20, 'under')), true))
      .toBe('10 TSS weniger als empfohlen, Dauer punktgenau.')
    expect(changeLine(review(pair(60, 45, -25, 'under'), pair(50, 50, 0, 'match')), false))
      .toBe('15 min shorter than prescribed, TSS spot on.')
  })

  it('folds an IF drift into the sentence and keeps it consistent with alignment', () => {
    // Mirrors user 5 brief 315: duration+TSS on plan, IF over.
    const r = review(pair(60, 60.8, 1.4, 'match'), pair(45, 49.1, 9.1, 'match'), pair(0.65, 0.73, 12.4, 'over'))
    expect(changeLine(r, true)).toBe('Die Intensität etwas höher als empfohlen, Dauer und TSS punktgenau.')
    expect(changeLine(r, false)).toBe('Intensity a touch higher than prescribed, duration and TSS spot on.')
  })
})

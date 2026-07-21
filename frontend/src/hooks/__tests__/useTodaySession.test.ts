import { describe, expect, it } from 'vitest'
import { briefFallbackState as hookFallback, sessionIntensity } from '../useTodaySession'
import { briefFallbackState as todayTabFallback } from '../../components/dashboard/tabs/TodayTab'
import { workoutDisplayTitle, workoutDisplayPurpose, type PrescribedWorkout } from '../../api/coach'
import { undoEligible } from '../../components/plan/AdaptiveCard'
import type { PlanAdaptation } from '../../api/plan'

/**
 * One source of truth: both tabs' session card is driven by useTodaySession.
 * These tests pin the shared derivations + the reuse contract (no forks).
 */

describe('briefFallbackState reuse (no fork)', () => {
  it('TodayTab re-exports the EXACT hook function object', () => {
    expect(todayTabFallback).toBe(hookFallback)
  })
})

const workout = (over: Partial<PrescribedWorkout> = {}): PrescribedWorkout => ({
  template_id: 'vo2_5x4',
  title: 'VO2 Max 5x4',
  duration_minutes: 57,
  predicted_tss: 72,
  framework_cited: 'Seiler',
  blocks: [],
  ...over,
})

const block = (zone: number, duration_s: number) => ({
  name: `Z${zone}`, duration_s, target_watts_low: 200, target_watts_high: 220,
  target_pct_ftp: 0.9, zone, rpe: 5, cadence_low: null, cadence_high: null,
  target_hr_low: null, target_hr_high: null,
})

describe('sessionIntensity (shared zone badge)', () => {
  it('labels by the hardest zone held ≥90s — a VO₂ day is never Z3', () => {
    const w = workout({
      blocks: [block(1, 600), block(5, 240), block(1, 180), block(5, 240)],
    })
    expect(sessionIntensity(w, false)).toEqual({ z: 'Z5', t: 'VO₂' })
  })

  it('ignores sub-90s spikes and uses the sustained zone', () => {
    const w = workout({
      blocks: [block(2, 3600), block(6, 30)],
    })
    expect(sessionIntensity(w, true)).toEqual({ z: 'Z2', t: 'Grundlage' })
  })

  it('falls back to IF derivation when no blocks exist', () => {
    // 60 min @ 45 TSS → IF ≈ 0.67 → Z2
    const w = workout({ blocks: [], duration_minutes: 60, predicted_tss: 45 })
    expect(sessionIntensity(w, false)).toEqual({ z: 'Z2', t: 'Endurance' })
  })

  it('is null without a workout', () => {
    expect(sessionIntensity(null, true)).toBeNull()
  })
})

describe('locale-honest display fields (round-2 review)', () => {
  it('prefers title_de/purpose_de under de, falls back to EN', () => {
    const w = workout({ title_de: 'VO₂max 5×4', purpose: 'Raises VO2 ceiling', purpose_de: 'Hebt deine VO₂max-Decke' })
    expect(workoutDisplayTitle(w, true)).toBe('VO₂max 5×4')
    expect(workoutDisplayTitle(w, false)).toBe('VO2 Max 5x4')
    expect(workoutDisplayPurpose(w, true)).toBe('Hebt deine VO₂max-Decke')
    expect(workoutDisplayPurpose(w, false)).toBe('Raises VO2 ceiling')
  })

  it('missing German fields never blank the card', () => {
    const w = workout({ title_de: null, purpose: 'Base work', purpose_de: null })
    expect(workoutDisplayTitle(w, true)).toBe('VO2 Max 5x4')
    expect(workoutDisplayPurpose(w, true)).toBe('Base work')
  })
})

describe('undoEligible (feed "Rückgängig" affordance)', () => {
  const row = (over: Partial<PlanAdaptation> = {}): PlanAdaptation => ({
    id: 1, created_at: new Date().toISOString(), target_date: '2026-07-21',
    source: 'user_change', signal: 'user_change', rule: 'user_modified',
    before: null, after: null, evidence: null,
    message_de: 'Du hast angepasst: …', message_en: 'You adjusted: …',
    ...over,
  })

  it('eligible: newest row, user_modified, inside 60 min', () => {
    expect(undoEligible(row(), 1)).toBe(true)
  })
  it('not eligible when not the newest row', () => {
    expect(undoEligible(row(), 2)).toBe(false)
  })
  it('not eligible for engine rules or reverts', () => {
    expect(undoEligible(row({ rule: 'sleep_hrv_downgrade' }), 1)).toBe(false)
    expect(undoEligible(row({ rule: 'revert' }), 1)).toBe(false)
  })
  it('not eligible outside the 60-min window', () => {
    const old = new Date(Date.now() - 61 * 60 * 1000).toISOString()
    expect(undoEligible(row({ created_at: old }), 1)).toBe(false)
  })
})

describe('workoutDisplayRationale (explainable prose only)', () => {
  it('debug-register strings never reach the card', async () => {
    const { workoutDisplayRationale, looksLikeInternals } = await import('../../api/coach')
    expect(looksLikeInternals('Phase: offseason. TSB 0, CTL 0.')).toBe(true)
    expect(looksLikeInternals('You slept well — today adds quality without burning a match.')).toBe(false)
    const w = workout({
      why_this_workout: 'Phase: offseason. TSB 0, CTL 0. Fat-oxidation / mitochondrial density at LT1.',
      purpose: 'Builds your aerobic engine at a fully sustainable effort.',
      purpose_de: 'Baut deine aerobe Basis auf — ruhig und nachhaltig.',
    })
    expect(workoutDisplayRationale(w, true)).toBe('Baut deine aerobe Basis auf — ruhig und nachhaltig.')
    expect(workoutDisplayRationale(w, false)).toBe('Builds your aerobic engine at a fully sustainable effort.')
  })

  it('prose rationale renders verbatim; nothing renders when all layers are internals', async () => {
    const { workoutDisplayRationale } = await import('../../api/coach')
    const prose = workout({ why_this_workout: 'Du warst konstant — heute kommt etwas Qualität dazu.' })
    expect(workoutDisplayRationale(prose, true)).toBe('Du warst konstant — heute kommt etwas Qualität dazu.')
    const allBad = workout({ why_this_workout: 'Phase: base. TSB -4, CTL 38.', purpose: 'TSB 1, CTL 2.', purpose_de: null })
    expect(workoutDisplayRationale(allBad, true)).toBeNull()
  })
})

describe('expandBlocks (interval bar chart)', () => {
  it('maps plain blocks 1:1 with duration + zone', async () => {
    const { expandBlocks } = await import('../../components/workout/BlockBars')
    const segs = expandBlocks([block(2, 600), block(4, 1200)])
    expect(segs).toHaveLength(2)
    expect(segs[1].duration_s).toBe(1200)
    expect(segs[1].zone).toBe(4)
  })

  it('expands composite micro-interval sets into on/off stripes', async () => {
    const { expandBlocks } = await import('../../components/workout/BlockBars')
    const micro = { ...block(5, 30 * 60), name: '30×30/30 micro set', target_pct_ftp: 1.2 }
    const segs = expandBlocks([micro])
    expect(segs).toHaveLength(60) // 30 on + 30 off
    expect(segs[0].duration_s).toBe(30)
    expect(segs[0].zone).toBe(5)
    expect(segs[1].zone).toBe(1) // off stripe
    expect(segs[1].pct).toBeLessThan(segs[0].pct)
  })

  it('leaves prose-only N×A/B names unexpanded when the math does not fit', async () => {
    const { expandBlocks } = await import('../../components/workout/BlockBars')
    const fake = { ...block(4, 600), name: '4×15/15 something' } // 4*30s ≠ 600s
    expect(expandBlocks([fake])).toHaveLength(1)
  })
})

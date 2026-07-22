import { describe, it, expect } from 'vitest'
import { flagshipState, flagshipColors } from '../TodayTab'

const base = {
  readinessPending: false,
  trainedToday: false,
  isPlannedRest: false,
  sidelined: false,
  decisionState: null as string | null,
  tier: null as string | null,
  score: null as number | null,
}

describe('flagshipState — the five faces of the Today flagship', () => {
  it('pending outranks everything (new day, no overnight data yet)', () => {
    expect(flagshipState({ ...base, readinessPending: true, trainedToday: true })).toBe('pending')
  })

  it('trained today → post-ride face', () => {
    expect(flagshipState({ ...base, trainedToday: true, decisionState: 'trained_already' })).toBe('post')
  })

  it('planned rest → planned-rest (teal) face, even when fresh', () => {
    expect(flagshipState({ ...base, isPlannedRest: true, tier: 'ready', score: 88 })).toBe('planned-rest')
  })

  it('sidelined (sick/injured/break) → rest face', () => {
    expect(flagshipState({ ...base, sidelined: true, decisionState: 'sick' })).toBe('rest')
  })

  it('recover decision or rest tier → rest-recommended face', () => {
    expect(flagshipState({ ...base, decisionState: 'recover' })).toBe('rest')
    expect(flagshipState({ ...base, tier: 'rest', score: 40 })).toBe('rest')
  })

  it('hard/quality decision or ready tier → ready (green) face', () => {
    expect(flagshipState({ ...base, decisionState: 'hard' })).toBe('ready')
    expect(flagshipState({ ...base, tier: 'peak', score: 90 })).toBe('ready')
  })

  it('easy decision or caution tier → controlled face', () => {
    expect(flagshipState({ ...base, decisionState: 'easy' })).toBe('controlled')
    expect(flagshipState({ ...base, tier: 'caution', score: 55 })).toBe('controlled')
  })

  it('falls back on the raw score when no decision/tier is available', () => {
    expect(flagshipState({ ...base, score: 80 })).toBe('ready')
    expect(flagshipState({ ...base, score: 20 })).toBe('rest')
    expect(flagshipState({ ...base, score: 50 })).toBe('controlled')
  })
})

describe('flagshipColors', () => {
  it('gives every state a distinct aura + ring colour', () => {
    const states = ['ready', 'controlled', 'rest', 'post', 'planned-rest', 'pending'] as const
    const auras = states.map((s) => flagshipColors(s).aura)
    expect(new Set(auras).size).toBe(states.length)
    for (const s of states) {
      expect(flagshipColors(s).aura).toMatch(/^#[0-9A-F]{6}$/i)
      expect(flagshipColors(s).ring).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})

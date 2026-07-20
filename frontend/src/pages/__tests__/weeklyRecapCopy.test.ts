import { describe, expect, it } from 'vitest'
import { payoffLine, finaleRhythmLine } from '../WeeklyRecapStory'

describe('payoffLine (audit P1-11 quiet-week reframe)', () => {
  it('a quiet week (< 60% of plan) gets the no-guilt copy — no shouted percent', () => {
    expect(payoffLine(80, 285, true)).toBe('80 von 285 TSS — eine ruhige Woche. Dein Plan passt sich an.')
    expect(payoffLine(80, 285, false)).toBe('80 of 285 TSS — a quiet week. Your plan adapts.')
    expect(payoffLine(80, 285, true)).not.toContain('%')
    expect(payoffLine(80, 285, false)).not.toContain('%')
  })

  it('60% is the boundary — at or above it the factual copy returns', () => {
    expect(payoffLine(59, 100, false)).toContain('a quiet week')
    expect(payoffLine(60, 100, false)).not.toContain('a quiet week')
  })

  it('corridor weeks stay factual', () => {
    const line = payoffLine(285, 285, false)
    expect(line).toContain('(100%)')
    expect(line).toContain('Right in the corridor.')
  })

  it('over-delivery rebalances, moderate shortfall reassures', () => {
    expect(payoffLine(340, 285, false)).toContain('next week rebalances')
    expect(payoffLine(200, 285, true)).toContain('völlig okay, der Plan passt sich an')
  })
})

describe('finaleRhythmLine (audit P1-11 — rhythm, not streak)', () => {
  it('ends on the week rhythm when consistency is present', () => {
    expect(finaleRhythmLine({ met: 4, planned: 5 }, 3, true)).toBe('4 von 5 geplanten Tagen — die Woche trägt.')
    expect(finaleRhythmLine({ met: 4, planned: 5 }, 3, false)).toBe('4 of 5 planned days — the week holds.')
  })

  it('falls back to the sessions count while consistency is absent', () => {
    expect(finaleRhythmLine(null, 3, true)).toBe('3 Einheiten letzte Woche — der Rhythmus trägt.')
    expect(finaleRhythmLine(undefined, 3, false)).toBe('3 sessions last week — the rhythm carries.')
    expect(finaleRhythmLine({ met: 0, planned: 0 }, 2, false)).toContain('2 sessions')
  })

  it('never speaks streak', () => {
    for (const c of [{ met: 4, planned: 5 }, null] as const) {
      for (const de of [true, false]) {
        expect(finaleRhythmLine(c, 3, de)).not.toMatch(/Serie|streak/i)
      }
    }
  })
})

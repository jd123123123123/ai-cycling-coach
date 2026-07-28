import { describe, it, expect } from 'vitest'
import {
  seasonArc, phaseLabel, CHAPTERS, chapterIndex, nextChapter,
  type SeasonArcInput,
} from '../seasonArc'

const NOW = new Date('2026-07-28T09:00:00')

function input(over: Partial<SeasonArcInput> = {}): SeasonArcInput {
  return { now: NOW, ...over }
}

describe('seasonArc — countdown precedence', () => {
  it('prefers the profile target date over brief evidence and over the server', () => {
    const a = seasonArc(input({
      targetEventDate: '2026-12-05',
      goalEventDate: '2026-09-01',
      meso: { days_to_event: 3 },
    }))
    expect(a.daysToEvent).toBe(130)
  })

  it('falls back to brief evidence when the profile has no date', () => {
    const a = seasonArc(input({ goalEventDate: '2026-12-05', meso: { days_to_event: 3 } }))
    expect(a.daysToEvent).toBe(130)
  })

  it('uses the server figure only when no client date exists at all', () => {
    expect(seasonArc(input({ meso: { days_to_event: 42 } })).daysToEvent).toBe(42)
  })

  it('never reports a negative countdown for an event already past', () => {
    expect(seasonArc(input({ targetEventDate: '2026-07-01' })).daysToEvent).toBe(0)
  })

  it('is null with no event anywhere', () => {
    expect(seasonArc(input()).daysToEvent).toBeNull()
    expect(seasonArc(input()).weeksToEvent).toBeNull()
  })

  it('reports whole weeks, rounded up — 130 days is 19 weeks to go', () => {
    expect(seasonArc(input({ targetEventDate: '2026-12-05' })).weeksToEvent).toBe(19)
  })
})

describe('seasonArc — block position', () => {
  it('converts the server 0-based block index to a 1-based week', () => {
    expect(seasonArc(input({ meso: { block_index_in_meso: 2 } })).weekInBlock).toBe(3)
  })

  it('keeps weekInBlock null when the server did not say, rather than guessing 1', () => {
    expect(seasonArc(input({ meso: { phase: 'build' } })).weekInBlock).toBeNull()
  })

  it('takes the block length from the server progression horizon', () => {
    expect(seasonArc(input({ meso: { progression: { horizon_weeks: 6 } } })).blockWeeks).toBe(6)
  })

  it('leaves blockWeeks null when no horizon is published — the bar then shows the phase alone', () => {
    expect(seasonArc(input({ meso: { phase: 'build', block_index_in_meso: 2 } })).blockWeeks).toBeNull()
  })

  it('rejects a nonsense horizon instead of dividing by it', () => {
    expect(seasonArc(input({ meso: { progression: { horizon_weeks: 0 } } })).blockWeeks).toBeNull()
  })
})

describe('seasonArc — synthesized flag', () => {
  it('is false when a real event is booked', () => {
    expect(seasonArc(input({ targetEventDate: '2026-12-05' })).synthesized).toBe(false)
  })

  it('is true when the horizon is the fitness-builder progression, not a race', () => {
    const a = seasonArc(input({ meso: { progression: { horizon_weeks: 6 } } }))
    expect(a.synthesized).toBe(true)
    expect(a.daysToEvent).toBeNull()
  })

  it('is true when there is no event and no horizon either', () => {
    expect(seasonArc(input()).synthesized).toBe(true)
  })
})

describe('phaseLabel', () => {
  it('localizes the stem and keeps the block number', () => {
    expect(phaseLabel('base1', true)).toBe('Grundlage 1')
    expect(phaseLabel('base1', false)).toBe('Base 1')
    expect(phaseLabel('build', true)).toBe('Aufbau')
  })

  it('falls back to a readable form for an unknown key rather than showing a raw slug', () => {
    expect(phaseLabel('polarized2', false)).toBe('Polarized 2')
  })

  it('has a stated default when the server sends no phase', () => {
    expect(phaseLabel(null, true)).toBe('Grundlage')
    expect(phaseLabel(null, false)).toBe('Base')
  })
})

describe('chapter ordering', () => {
  it('is exactly four chapters in story order', () => {
    expect(CHAPTERS).toEqual(['today', 'plan', 'body', 'history'])
  })

  it('indexes them from zero for the progress dots', () => {
    expect(chapterIndex('today')).toBe(0)
    expect(chapterIndex('history')).toBe(3)
  })

  it('loops the last chapter back to the first — the arc closes', () => {
    expect(nextChapter('today')).toBe('plan')
    expect(nextChapter('history')).toBe('today')
  })
})

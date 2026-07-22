import { describe, expect, it } from 'vitest'
import type { AnswerFact } from '../../hooks/useChatStream'
import {
  MAX_FACTS,
  formatFactValue,
  normalizeFacts,
  toneChipStyle,
  toneColor,
} from '../coachAnswer'

function fact(over: Partial<AnswerFact> = {}): AnswerFact {
  return { label: 'Ruhepuls', value: 48, unit: 'bpm', tone: 'good', ...over }
}

describe('toneColor', () => {
  it('maps good → forest green', () => {
    expect(toneColor('good')).toBe('var(--color-forest-2)')
  })
  it('maps caution → amber', () => {
    expect(toneColor('caution')).toBe('var(--color-amber)')
  })
  it('maps neutral / unknown → quiet ink', () => {
    expect(toneColor('neutral')).toBe('var(--color-ink-2)')
    expect(toneColor(undefined)).toBe('var(--color-ink-2)')
    expect(toneColor('bogus')).toBe('var(--color-ink-2)')
  })
})

describe('toneChipStyle', () => {
  it('good/caution chips are tinted; neutral sits on the quiet surface', () => {
    expect(toneChipStyle('good').color).toBe('var(--color-forest-2)')
    expect(toneChipStyle('good').backgroundColor).toContain('rgba(22, 224, 138')
    expect(toneChipStyle('caution').color).toBe('var(--color-amber)')
    expect(toneChipStyle('neutral').backgroundColor).toBe('var(--color-surface-2)')
  })
})

describe('formatFactValue', () => {
  it('renders numbers and strings verbatim', () => {
    expect(formatFactValue(48)).toBe('48')
    expect(formatFactValue(7.8)).toBe('7.8')
    expect(formatFactValue('33/100')).toBe('33/100')
  })
  it('falls back to the honest em-dash on missing value', () => {
    expect(formatFactValue(undefined)).toBe('—')
    expect(formatFactValue(null)).toBe('—')
  })
})

describe('normalizeFacts', () => {
  it('caps at MAX_FACTS (4)', () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      fact({ label: `L${i}`, value: i }),
    )
    expect(normalizeFacts(many)).toHaveLength(MAX_FACTS)
  })
  it('drops chips missing a label or value', () => {
    const mixed = [
      fact({ label: '', value: 1 }),
      { value: 2, tone: 'good' } as unknown as AnswerFact,
      fact({ label: 'Ok', value: undefined as unknown as number }),
      fact({ label: 'Keep', value: 5 }),
    ]
    const out = normalizeFacts(mixed)
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Keep')
  })
  it('coerces an out-of-range tone to neutral', () => {
    const out = normalizeFacts([fact({ tone: 'bogus' as never })])
    expect(out[0].tone).toBe('neutral')
  })
  it('returns [] on the no-data path', () => {
    expect(normalizeFacts([])).toEqual([])
    expect(normalizeFacts(undefined)).toEqual([])
  })
})

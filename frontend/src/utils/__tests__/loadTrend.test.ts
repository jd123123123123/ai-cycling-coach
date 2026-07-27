import { describe, expect, it } from 'vitest'
import { classifyForm } from '../loadMetrics'

// Load & Form hero: the TSB → fitness/form classifier is the single source for
// the hero number, pill and gauge tone. Bands must stay monotone and neutral
// (the banned words Verletzung / Gefahr / Untertraining must never appear).
describe('classifyForm (Load & Form hero)', () => {
  it('null TSB → dash, muted, honest empty sub', () => {
    const r = classifyForm(null, true)
    expect(r.label).toBe('—')
    expect(r.color).toBe('var(--color-muted)')
  })

  it('deep negative TSB → overreached (move colour)', () => {
    expect(classifyForm(-20, false).label).toBe('Overreached')
    expect(classifyForm(-20, false).color).toBe('var(--color-move)')
    expect(classifyForm(-16, true).label).toBe('Überlastet')
  })

  it('mildly negative TSB → building (amber)', () => {
    expect(classifyForm(-8, false).label).toBe('Building')
    expect(classifyForm(-8, false).color).toBe('var(--color-amber)')
    expect(classifyForm(-6, true).label).toBe('Aufbauend')
  })

  it('balanced TSB → sweet spot (recovery)', () => {
    expect(classifyForm(0, false).label).toBe('Sweet spot')
    expect(classifyForm(5, false).color).toBe('var(--color-recovery)')
    expect(classifyForm(3, true).label).toBe('Optimal')
  })

  it('high positive TSB → fresh (strain)', () => {
    expect(classifyForm(18, false).label).toBe('Fresh')
    expect(classifyForm(18, false).color).toBe('var(--color-strain)')
    expect(classifyForm(15, true).label).toBe('Frisch')
  })

  // TSB > 10 is produced by a taper and by a week off the bike alike, and the
  // copy used to congratulate both ("Very fresh — ideal for racing"). The CTL
  // trend is what separates them.
  describe('high TSB: taper vs detraining', () => {
    it('keeps the racing read when fitness is being held through the taper', () => {
      const r = classifyForm(18, false, -2)
      expect(r.sub).toBe('Very fresh — ideal for racing')
      expect(r.color).toBe('var(--color-strain)')
    })

    it('calls out slipping fitness when CTL is falling hard', () => {
      const r = classifyForm(18, false, -6)
      expect(r.sub).toBe('Rested, but fitness is slipping — time to get back on')
      expect(r.color).toBe('var(--color-amber)')
      expect(classifyForm(18, true, -6).sub).toContain('Fitness fällt')
    })

    it('is unchanged when the CTL trend is unknown', () => {
      expect(classifyForm(18, false, null).sub).toBe('Very fresh — ideal for racing')
    })

    it('does not fire below the top band — building days keep their own copy', () => {
      expect(classifyForm(-8, false, -9).label).toBe('Building')
    })
  })

  it('bands are monotone across the boundaries', () => {
    const order = ['var(--color-move)', 'var(--color-amber)', 'var(--color-recovery)', 'var(--color-strain)']
    const seen = [-15, -5, 10, 25].map((t) => classifyForm(t, false).color)
    expect(seen).toEqual(order)
  })

  it('never renders banned illness/injury words', () => {
    const banned = /Verletzung|Gefahr|Untertraining|injury|danger/i
    for (const t of [-30, -20, -10, -6, 0, 5, 12, 25]) {
      for (const de of [true, false]) {
        const r = classifyForm(t, de)
        expect(r.label + r.sub).not.toMatch(banned)
      }
    }
  })
})

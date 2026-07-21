import { describe, expect, it } from 'vitest'
import { loadBarFraction, loadSnapshotNarrative } from '../TheRoadCard'

/**
 * The Today "Training Load" card (pen V3 · Today → Load Card mDpsp). These pin
 * the pure copy + bar-scale helpers so the card renders real PMC honestly and
 * matches the pen proportions (CTL 68 / ATL 54 → ~80% / ~64%).
 */

describe('loadSnapshotNarrative', () => {
  it('reproduces the pen example (ctl 68 / atl 54 / tsb +14 / dCtl +5)', () => {
    const n = loadSnapshotNarrative(68, 54, 14, 5, false)
    expect(n.ramp).toEqual({ label: 'Optimal ramp', color: 'var(--color-recovery)', dir: 'up' })
    expect(n.form?.value).toBe('Form +14')
    expect(n.form?.note).toBe('fresh legs')
    expect(n.form?.color).toBe('var(--color-recovery)')
    expect(n.caption).toBe("Fitness up, fatigue easing — you're building without digging a hole.")
  })

  it('German copy is first-class (no Denglish)', () => {
    const n = loadSnapshotNarrative(68, 54, 14, 5, true)
    expect(n.ramp?.label).toBe('Optimaler Aufbau')
    expect(n.form?.note).toBe('frische Beine')
    expect(n.caption).toBe('Fitness steigt, Ermüdung baut ab — du baust auf, ohne dich einzugraben.')
  })

  it('flags a steep ramp (dCtl > 8) in amber', () => {
    const n = loadSnapshotNarrative(60, 70, -10, 12, false)
    expect(n.ramp).toEqual({ label: 'Steep ramp', color: 'var(--color-amber)', dir: 'up' })
  })

  it('warns when fatigue runs high (very negative TSB)', () => {
    const n = loadSnapshotNarrative(60, 82, -22, 4, false)
    expect(n.form?.color).toBe('var(--color-amber)')
    expect(n.form?.note).toBe('fatigue building')
    expect(n.caption).toBe('Fitness up, fatigue running high — time to ease off a touch.')
  })

  it('reads a taper honestly — fitness easing with fresh legs is not "building"', () => {
    // user 5's live case: CTL 36, ATL 32, TSB +4, dCtl −2.
    const n = loadSnapshotNarrative(36, 32, 4, -2, true)
    expect(n.caption).toBe('Fitness lässt nach, Ermüdung im Griff — die Form frischt auf.')
    expect(loadSnapshotNarrative(36, 32, 4, -2, false).caption)
      .toBe('Fitness easing, fatigue in check — form is freshening.')
  })

  it('drops the ramp pill when the 7-day trend is unknown', () => {
    expect(loadSnapshotNarrative(36, 30, 6, null, false).ramp).toBeNull()
  })

  it('drops the Form callout and caption when data is thin', () => {
    const n = loadSnapshotNarrative(36, null, null, 3, false)
    expect(n.form).toBeNull()
    expect(n.caption).toBeNull()
  })

  it('reads a flat trend honestly (dCtl 0)', () => {
    expect(loadSnapshotNarrative(40, 38, 2, 0, false).ramp?.label).toBe('Holding steady')
  })
})

describe('loadBarFraction', () => {
  it('scales both bars on one shared max with ~25% headroom (pen proportions)', () => {
    expect(loadBarFraction(68, 68, 54)).toBeCloseTo(0.8, 3)
    expect(loadBarFraction(54, 68, 54)).toBeCloseTo(0.635, 2)
  })

  it('clamps to [0,1] and treats null as empty', () => {
    expect(loadBarFraction(null, 68, 54)).toBe(0)
    expect(loadBarFraction(200, 10, 10)).toBe(1)
  })
})

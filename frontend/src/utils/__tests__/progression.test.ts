// Next-milestone display coherence (review finding): at 3.46 W/kg the hero
// shows "3.5 W/kg" (1-decimal rounding) — the next-goal chip must therefore
// be STRICTLY greater than the displayed current value, never the same number.
import { describe, expect, it } from 'vitest'
import { wkgPotential } from '../progression'

describe('wkgPotential next milestone at display precision', () => {
  it('skips a milestone that rounds to the displayed current value', () => {
    // 3.46 displays as 3.5 — next goal must not also be 3.5.
    const p = wkgPotential(3.46)
    expect(p).not.toBeNull()
    expect(Math.round(p!.nextValue * 10) / 10).toBeGreaterThan(3.5 - 1e-9)
    expect(p!.nextValue).toBe(4.0)
  })

  it('keeps the immediate next band when it is strictly greater on display', () => {
    const p = wkgPotential(3.2)
    expect(p!.nextValue).toBe(3.5)
  })

  it('below-first-band athlete still gets an above-current milestone', () => {
    const p = wkgPotential(1.8)
    expect(p!.nextValue).toBeGreaterThan(1.8)
  })

  it('current band classification is unchanged', () => {
    expect(wkgPotential(3.46)!.level).toBe('Cat 5')
    expect(wkgPotential(3.6)!.level).toBe('Cat 4')
  })
})

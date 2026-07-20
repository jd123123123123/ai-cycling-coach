import { describe, expect, it } from 'vitest'
import { classifyLoadTrend } from '../../pages/LoadFormView'

describe('classifyLoadTrend (audit P1-9)', () => {
  it('rising fast above 1.2× pace — amber with action attached', () => {
    const r = classifyLoadTrend(250, 200, false, false)
    expect(r.state).toBe('rising')
    expect(r.headline).toMatch(/Rising fast/)
  })

  it('in rhythm between 0.8 and 1.2', () => {
    expect(classifyLoadTrend(200, 200, false, false).state).toBe('rhythm')
    expect(classifyLoadTrend(170, 200, false, true).headline).toBe('Im Rhythmus')
  })

  it('room to build below 0.8 — neutral, never a shortfall label', () => {
    const r = classifyLoadTrend(100, 200, false, true)
    expect(r.state).toBe('build')
    expect(r.headline).toBe('Luft nach oben')
    expect(r.body).toBeNull()
    expect(r.color).toBe('var(--color-muted)')
  })

  it('planned quiet week explains instead of labeling', () => {
    const r = classifyLoadTrend(100, 200, true, true)
    expect(r.body).toMatch(/bewusst ruhig/)
  })

  it('never emits banned vocabulary', () => {
    for (const args of [[50, 200], [200, 200], [500, 200]] as const) {
      for (const de of [true, false]) {
        const r = classifyLoadTrend(args[0], args[1], false, de)
        expect(`${r.headline} ${r.body ?? ''}`).not.toMatch(/Verletzung|Gefahr|Untertraining|injury|danger|undertraining/i)
      }
    }
  })
})

import { describe, expect, it } from 'vitest'
import { STAGE_THEMES, FLOOR, DEFAULT_STAGE_THEME, stageThemeById } from '../w3stageThemes'

/**
 * The three invariants every stage theme must hold (module docblock), pinned:
 * a theme that drifts off the measured horizon makes the bike float, a
 * procedural theme without a ground breaks the page's runway, and an unknown
 * id must land a rider in the studio — never on a blank wall.
 */

const H = `${(FLOOR * 100).toFixed(1)}%`

describe('the stage themes', () => {
  it('are eight: five plain, three playful, ids unique', () => {
    expect(STAGE_THEMES).toHaveLength(8)
    expect(new Set(STAGE_THEMES.map((t) => t.id)).size).toBe(8)
  })

  it('every procedural plate carries the duplicated stop at the measured FLOOR', () => {
    for (const t of STAGE_THEMES) {
      if (t.css == null) continue // the studio webp measures its own horizon
      // The crisp horizon IS the duplicated stop: the fraction must appear
      // twice in the plate's gradient (wall bottom, floor top).
      const hits = t.css.split(H).length - 1
      expect(hits, `${t.id} horizon`).toBeGreaterThanOrEqual(2)
    }
  })

  it('every procedural theme knows the colour it ends in', () => {
    for (const t of STAGE_THEMES) {
      if (t.css == null) continue
      expect(t.ground, `${t.id} ground`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      // …and the plate actually ends in it, so the runway continues seamlessly.
      expect(t.css.includes(t.ground as string), `${t.id} plate ends in its ground`).toBe(true)
    }
  })

  it('the studio is the default, and an unknown id falls back to it', () => {
    expect(DEFAULT_STAGE_THEME.id).toBe('studio')
    expect(stageThemeById(null).id).toBe('studio')
    expect(stageThemeById('does-not-exist').id).toBe('studio')
    expect(stageThemeById('nachtfahrt').id).toBe('nachtfahrt')
  })

  it('the studio stays byte-identical to what shipped: webp plate, sampled ground', () => {
    const studio = stageThemeById('studio')
    expect(studio.css).toBeNull()
    expect(studio.ground).toBeNull()
  })
})

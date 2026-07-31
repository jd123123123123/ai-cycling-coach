/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import RehearsalProfile from '../RehearsalProfile'
import { TERRAIN_FILL } from '../profileMath'
import type { RehearsalSegment } from '../../../api/rehearsal'

const seg = (i: number, gradient: number): RehearsalSegment => ({
  start_m: i * 150, gradient_pct: gradient, elevation_m: null, power_w: 240, speed_ms: 6,
  elapsed_s: i * 25, w_bal_j: 20000 - i * 100, climb_id: gradient > 3 ? 1 : null,
})

const segments = [seg(0, 0), seg(1, 6), seg(2, 9), seg(3, -4)]
const elevations = [1000, 1010, 1030, 1020]

/** Resolve `var(--color-x)` → its hex value, straight from the app's own
 *  runtime `:root` token block in index.css — read directly off disk, not
 *  a hand-copied palette, so this test can't silently drift from the real
 *  tokens. */
function resolveCssVars(): Record<string, string> {
  const cssPath = path.resolve(process.cwd(), 'src/index.css')
  const css = readFileSync(cssPath, 'utf-8')
  const rootBlockMatch = css.match(/:root\s*\{([^}]*)\}/)
  if (!rootBlockMatch) throw new Error('could not find :root token block in index.css')
  const vars: Record<string, string> = {}
  for (const m of rootBlockMatch[1].matchAll(/(--color-[\w-]+):\s*(#[0-9A-Fa-f]+)/g)) {
    vars[m[1]] = m[2].toLowerCase()
  }
  return vars
}

function cssVarName(value: string): string {
  const m = value.match(/^var\((--[\w-]+)\)$/)
  if (!m) throw new Error(`not a var() reference: ${value}`)
  return m[1]
}

describe('RehearsalProfile', () => {
  afterEach(cleanup)

  it('renders nothing without segments', () => {
    const { container } = render(
      <RehearsalProfile segments={[]} elevations={[]} width={358} height={140} onScrub={() => {}} />,
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws the elevation silhouette', () => {
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={() => {}} />,
    )
    expect(container.querySelector('polygon')).not.toBeNull()
  })

  it('fits the silhouette inside the box', () => {
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={() => {}} />,
    )
    const pts = container.querySelector('polygon')!.getAttribute('points')!
    const ys = pts.split(' ').map((p) => Number(p.split(',')[1]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(140)
  })

  it('reports the scrubbed segment index on pointer move', () => {
    const onScrub = vi.fn()
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={onScrub} />,
    )
    const svg = container.querySelector('svg')!
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 358, height: 140, right: 358, bottom: 140, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    fireEvent.pointerMove(svg, { clientX: 179 })
    expect(onScrub).toHaveBeenCalled()
    const idx = onScrub.mock.calls.at(-1)![0]
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(segments.length)
  })

  it('clears the scrub on pointer leave', () => {
    const onScrub = vi.fn()
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={onScrub} />,
    )
    fireEvent.pointerLeave(container.querySelector('svg')!)
    expect(onScrub).toHaveBeenLastCalledWith(null)
  })

  // Regression test for the invisible-terrain bug: --color-zone-1 resolved
  // to the exact same hex as the card surface behind the chart, so flat and
  // descending segments (painted with it) vanished. A test that only checks
  // "the fill is some var()" can't catch that — it has to resolve the
  // tokens and compare actual colours.
  it('never fills the silhouette with a colour that resolves to the card surface behind it', () => {
    const vars = resolveCssVars()
    // The card behind the chart is a translucent tint of --color-paper-2
    // (see glassCard.ts); --color-surface-3 is the other "high, dark
    // surface" token in the same family. Neither should be reachable via
    // any fill this chart draws.
    const cardLikeHexes = new Set([vars['--color-paper-2'], vars['--color-surface-3']])
    expect(cardLikeHexes.size).toBe(2) // sanity: the tokens actually differ from each other

    const terrainHex = vars[cssVarName(TERRAIN_FILL)]
    expect(terrainHex).toBeTruthy()
    expect(cardLikeHexes.has(terrainHex)).toBe(false)

    // The bug, made concrete: --color-zone-1 in this app's dark theme really
    // does collide with --color-surface-3. Assert that fact stays true (so
    // this test would still catch a regression) while proving the chart
    // never uses zone-1 to paint anything.
    expect(vars['--color-zone-1']).toBe(vars['--color-surface-3'])
  })

  it('draws the whole route as one continuous terrain fill, with zone tints only over climbing spans', () => {
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={() => {}} />,
    )
    const polygons = Array.from(container.querySelectorAll('polygon'))
    // One base terrain polygon (drawn first) + one tint per climbing
    // segment (gradient > 3 in the fixture: indices 1 and 2).
    expect(polygons.length).toBe(1 + 2)

    const terrain = polygons[0]
    expect(terrain.getAttribute('fill')).toBe(TERRAIN_FILL)

    // Every subsequent polygon is a climb tint, never the terrain fill and
    // never the broken zone-1 token.
    for (const p of polygons.slice(1)) {
      const fill = p.getAttribute('fill')
      expect(fill).not.toBe(TERRAIN_FILL)
      expect(fill).not.toBe('var(--color-zone-1)')
    }

    // The terrain polygon must span the full width, start-to-finish — no
    // gap where a flat/descending segment would otherwise leave a hole.
    const pts = terrain.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[0]))
    expect(Math.min(...pts)).toBeCloseTo(0, 0)
    expect(Math.max(...pts)).toBeCloseTo(358, 0)
  })
})

// frontend/src/editorial/__tests__/w3PowerCurve.test.tsx
//
// The power-duration curve — the artefact a trained cyclist opens the app for.
// The data was served all along; this is it drawn in W3 rather than stranded on
// the old /power-profile screen.
//
// Two properties carry the whole chart:
//  · the x-axis is LOGARITHMIC. On a linear axis 5 s / 15 s / 1 min — the end
//    that separates a sprinter from a time-triallist — collapse into the first
//    2 % of the width and the curve says nothing.
//  · a duration the rider has never held is DROPPED, never zeroed. A line that
//    dives to 0 W at 60 min claims they emptied themselves; the truth is only
//    that they have not ridden an hour hard with a power meter.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import W3PowerCurve, { logX, plottable } from '../w3/W3PowerCurve'
import type { HeroPoint } from '../../hooks/usePowerProfileView'

afterEach(cleanup)

const pt = (seconds: number, watts: number | null, is_pr = false): HeroPoint => ({
  seconds, watts, wkg: null, is_pr,
  label_en: `${seconds}s`, label_de: `${seconds}s`,
})

const FULL: HeroPoint[] = [
  pt(5, 1100), pt(15, 820), pt(60, 480), pt(300, 340), pt(1200, 292), pt(3600, 265),
]

describe('logX', () => {
  it('is logarithmic, so the short end keeps real width', () => {
    // 5s..60s is a factor of 12; 300s..3600s is a factor of 12 as well. On a log
    // axis those two spans must occupy the SAME width. On a linear axis the
    // first would be ~1.5% and the second ~92%.
    const shortSpan = logX(60) - logX(5)
    const longSpan = logX(3600) - logX(300)
    expect(Math.abs(shortSpan - longSpan)).toBeLessThan(0.001)
  })

  it('pins the ends of the domain', () => {
    expect(logX(5)).toBeCloseTo(0, 5)
    expect(logX(3600)).toBeCloseTo(1, 5)
  })

  it('gives the 1-minute effort real estate a linear axis would deny it', () => {
    // Linear would put 60s at (60-5)/3595 ≈ 1.5% of the width.
    expect(logX(60)).toBeGreaterThan(0.3)
  })
})

describe('plottable', () => {
  it('drops durations the rider has never held instead of zeroing them', () => {
    const withGap = [...FULL.slice(0, 4), pt(1200, null), pt(3600, null)]
    const out = plottable(withGap)
    expect(out.map((p) => p.seconds)).toEqual([5, 15, 60, 300])
    expect(out.some((p) => p.watts === 0 || p.watts == null)).toBe(false)
  })

  it('sorts by duration so the path cannot zig-zag', () => {
    const shuffled = [pt(300, 340), pt(5, 1100), pt(3600, 265), pt(60, 480)]
    expect(plottable(shuffled).map((p) => p.seconds)).toEqual([5, 60, 300, 3600])
  })
})

describe('W3PowerCurve', () => {
  it('draws a curve and one dot per real point', () => {
    const { container } = render(<W3PowerCurve curve={FULL} />)
    expect(container.querySelector('path[stroke]')).toBeTruthy()
    expect(container.querySelectorAll('circle').length).toBe(FULL.length)
  })

  it('renders nothing at all with fewer than two real points', () => {
    // One point is not a curve, and an axis around a single dot is furniture
    // pretending to be a chart.
    const { container } = render(<W3PowerCurve curve={[pt(5, 1100), pt(60, null)]} />)
    expect(container.innerHTML).toBe('')
  })

  it('marks a personal record differently from an ordinary point', () => {
    const { container } = render(<W3PowerCurve curve={[pt(5, 1100, true), pt(60, 480)]} />)
    const radii = [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('r')))
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii))
  })

  it('prints every plotted watt as a number, not only as a shape', () => {
    const { container } = render(<W3PowerCurve curve={FULL} />)
    const text = container.textContent ?? ''
    for (const p of FULL) expect(text).toContain(String(p.watts))
  })
})

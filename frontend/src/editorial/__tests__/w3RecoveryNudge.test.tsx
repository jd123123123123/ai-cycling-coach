// frontend/src/editorial/__tests__/w3RecoveryNudge.test.tsx
//
// The morning-health nudge draws each signal's real series — and the baseline
// it is being judged against.
//
// What this guards: the card's sentence is always "X sits N off your baseline",
// so a chart that omits the baseline shows a shape without the level that made
// it worth mentioning. The dashed rule is that level. It must be drawn, and it
// must be INSIDE the box: the baseline is folded into the scaling domain,
// because the case this card exists for is precisely the morning where today's
// reading sits outside the recent range.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import W3RecoveryNudge from '../w3/W3RecoveryNudge'

const checkMock = vi.fn()

vi.mock('../../hooks/useMorningHealthCheck', () => ({
  useMorningHealthCheck: () => checkMock(),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const signal = (over: Record<string, unknown> = {}) => ({
  metric: 'hrv',
  value: 42,
  baseline: 55,
  direction: 'down' as const,
  delta: -13,
  unit: 'ms',
  severity: 'strong' as const,
  series: [50, 48, 46, 44, 42],
  ...over,
})

const SVG = 'svg'

describe('W3RecoveryNudge sparkline', () => {
  it('draws the baseline the number is compared against', () => {
    checkMock.mockReturnValue({
      data: { level: 'watch', polarity: 'warning', signals: [signal()], headline: 'h', recommendation: 'r' },
    })
    const { container } = render(<W3RecoveryNudge />)

    const dashed = container.querySelectorAll('line[stroke-dasharray]')
    expect(dashed.length).toBe(1)
  })

  it('keeps a baseline OUTSIDE the series range inside the drawn box', () => {
    // Today is the worst reading of the window, so the baseline sits above
    // every point in `series` — the exact shape of a genuine downturn.
    checkMock.mockReturnValue({
      data: {
        level: 'elevated',
        polarity: 'warning',
        signals: [signal({ baseline: 80, series: [50, 48, 46, 44, 42] })],
        headline: 'h',
        recommendation: 'r',
      },
    })
    const { container } = render(<W3RecoveryNudge />)

    const svg = container.querySelector(SVG)!
    const h = Number(svg.getAttribute('height'))
    const line = container.querySelector('line[stroke-dasharray]')!
    const y = Number(line.getAttribute('y1'))

    // Clamped to the top edge (0) is what happens when the baseline is left out
    // of the domain; inside the box AND at the top of it is what we want.
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(h)
    // The series must still be below the baseline, not flattened onto it.
    const poly = container.querySelector('polyline')!
    const ys = poly.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1]))
    expect(Math.min(...ys)).toBeGreaterThan(y)
  })

  it('draws no baseline rule when the server has no baseline for a signal', () => {
    checkMock.mockReturnValue({
      data: { level: 'watch', polarity: 'warning', signals: [signal({ baseline: null })], headline: 'h', recommendation: 'r' },
    })
    const { container } = render(<W3RecoveryNudge />)

    expect(container.querySelectorAll('line[stroke-dasharray]').length).toBe(0)
    // …but the series itself still renders: a missing baseline hides the rule,
    // never the reading.
    expect(container.querySelector('polyline')).toBeTruthy()
  })
})

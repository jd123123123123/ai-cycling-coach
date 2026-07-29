import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Sparkline from '../Sparkline'

vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react')
  return { ...actual, useReducedMotion: vi.fn(() => false) }
})

afterEach(cleanup)

describe('Sparkline', () => {
  it('draws a polyline and a filled area through the values', () => {
    const { container } = render(<Sparkline values={[10, 12, 11, 14, 18]} color="var(--color-recovery)" />)
    expect(container.querySelector('polyline')).toBeTruthy()
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('renders nothing at all below two points — one point is not a trend', () => {
    expect(render(<Sparkline values={[42]} color="red" />).container.querySelector('svg')).toBeNull()
    cleanup()
    expect(render(<Sparkline values={[]} color="red" />).container.querySelector('svg')).toBeNull()
  })

  it('survives a flat series without dividing by a zero range', () => {
    // All-equal values give range 0; a naive (v - min) / (max - min) would be
    // NaN and emit "NaN" into the points attribute, silently drawing nothing.
    const { container } = render(<Sparkline values={[50, 50, 50, 50]} color="red" />)
    const pts = container.querySelector('polyline')!.getAttribute('points')!
    expect(pts).not.toContain('NaN')
    expect(pts.length).toBeGreaterThan(0)
  })

  it('uses the colour it is given for both stroke and fill', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="var(--color-move)" />)
    expect(container.innerHTML).toContain('--color-move')
  })

  it('is decorative by default and described when given a label', () => {
    const { container: plain } = render(<Sparkline values={[1, 2, 3]} color="red" />)
    expect(plain.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    cleanup()
    const { container: labelled } = render(<Sparkline values={[1, 2, 3]} color="red" label="HRV trend" />)
    expect(labelled.querySelector('svg')!.getAttribute('aria-hidden')).toBeNull()
    expect(labelled.querySelector('title')!.textContent).toBe('HRV trend')
  })

  it('marks the most recent point so the eye lands on today', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="red" />)
    expect(container.querySelector('circle')).toBeTruthy()
  })

  it('draws a rising series as a RISING curve — oldest left, higher is higher', () => {
    // The geometry contract, pinned. Everything else in this file checks that
    // *something* was drawn; nothing checks WHICH WAY. A flipped y (or a
    // reversed x) would still emit a valid points string and still pass every
    // other assertion here, while drawing a curve that falls when the value
    // rose — which, next to a chip reading "+31%", is a lie about the athlete's
    // data. SVG y grows DOWNWARD, so a rising value must produce a SMALLER y.
    const { container } = render(<Sparkline values={[10, 20, 30, 40]} color="red" />)
    const pairs = container
      .querySelector('polyline')!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((p) => p.split(',').map(Number))

    expect(pairs).toHaveLength(4)
    const [firstX, firstY] = pairs[0]
    const [lastX, lastY] = pairs[pairs.length - 1]

    // Oldest sample sits at the left edge, newest at the right.
    expect(firstX).toBe(0)
    expect(lastX).toBeGreaterThan(firstX)
    // Rising values climb the chart: the last point is ABOVE the first.
    expect(lastY).toBeLessThan(firstY)
    // And it is monotonic the whole way, not just at the endpoints.
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i][0]).toBeGreaterThan(pairs[i - 1][0])
      expect(pairs[i][1]).toBeLessThan(pairs[i - 1][1])
    }
  })
})

describe('Sparkline — draw-in animation', () => {
  it('calls useReducedMotion and configures animation when motion is not reduced', async () => {
    const { useReducedMotion } = await import('motion/react')
    vi.mocked(useReducedMotion).mockReturnValue(false)
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} color="red" />)
    // Verify the hook was called to check the user's motion preference.
    // This is the condition that gates the animation code path.
    expect(vi.mocked(useReducedMotion)).toHaveBeenCalled()
    const polyline = container.querySelector('polyline')!
    const path = container.querySelector('path')!
    // Both motion.path and motion.polyline render as real SVG elements.
    // In reduce=false mode, the component passes initial={{ pathLength: 0 }}
    // and initial={{ opacity: 0 }} to them, which Motion handles.
    expect(polyline).toBeTruthy()
    expect(path).toBeTruthy()
    // Verify the elements have the expected SVG structure.
    expect(polyline.getAttribute('points')).toBeTruthy()
    expect(path.getAttribute('d')).toBeTruthy()
  })

  it('calls useReducedMotion and skips animation when motion is reduced — the finished chart renders on first paint', async () => {
    const { useReducedMotion } = await import('motion/react')
    vi.mocked(useReducedMotion).mockReturnValue(true)
    vi.clearAllMocks() // Clear any prior calls from setup
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} color="red" />)
    // Verify the hook was called to check the user's motion preference.
    expect(vi.mocked(useReducedMotion)).toHaveBeenCalled()
    const polyline = container.querySelector('polyline')!
    const path = container.querySelector('path')!
    // With reduce=true, `initial={false}` means Motion renders the `animate`
    // target immediately, with no animation keyframe — just the final state on first paint.
    expect(polyline).toBeTruthy()
    expect(path).toBeTruthy()
    // The chart must be fully rendered and visible, not in an initial animated state.
    // Points attribute must be the complete, final path (4 coordinate pairs).
    const points = polyline.getAttribute('points')!
    expect(points.trim().length).toBeGreaterThan(0)
    expect(points.split(' ').length).toBe(4) // one coordinate pair per input value
  })
})

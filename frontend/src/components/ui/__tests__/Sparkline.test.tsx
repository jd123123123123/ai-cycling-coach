import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Sparkline from '../Sparkline'

vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react')
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
    motion: {
      ...actual.motion,
      // Sparkline's own job is choosing the RIGHT initial/animate/transition
      // values given `reduce` — whether Motion correctly animates those values
      // afterward is Motion's own tested responsibility, not this component's.
      // So these stubs render as real SVG elements (children/attrs still work)
      // but ALSO stamp their initial/transition props onto inspectable
      // data-* attributes, so a test can assert on the exact object Sparkline
      // computed without depending on Motion's real animation engine or
      // jsdom's ability to compute animated styles synchronously.
      polyline: (props: Record<string, unknown>) => {
        const { initial, animate, transition, ...rest } = props
        return (
          <polyline
            {...(rest as React.SVGProps<SVGPolylineElement>)}
            data-initial={JSON.stringify(initial)}
            data-animate={JSON.stringify(animate)}
            data-transition={JSON.stringify(transition)}
          />
        )
      },
      path: (props: Record<string, unknown>) => {
        const { initial, animate, transition, ...rest } = props
        return (
          <path
            {...(rest as React.SVGProps<SVGPathElement>)}
            data-initial={JSON.stringify(initial)}
            data-animate={JSON.stringify(animate)}
            data-transition={JSON.stringify(transition)}
          />
        )
      },
    },
  }
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
  it('gives the polyline and fill a real starting keyframe when motion is not reduced', async () => {
    const { useReducedMotion } = await import('motion/react')
    vi.mocked(useReducedMotion).mockReturnValue(false)
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} color="red" />)
    const polyline = container.querySelector('polyline')!
    const path = container.querySelector('path')!
    // With reduce=false, `initial` must be a REAL starting keyframe distinct
    // from the animate target — pathLength 0, not `false` (which would mean
    // "skip the enter animation entirely").
    expect(JSON.parse(polyline.getAttribute('data-initial')!)).toMatchObject({ pathLength: 0 })
    expect(JSON.parse(polyline.getAttribute('data-animate')!)).toMatchObject({ pathLength: 1 })
    expect(JSON.parse(path.getAttribute('data-initial')!)).toMatchObject({ opacity: 0 })
    // And the transition must be a real, non-zero duration.
    const t = JSON.parse(polyline.getAttribute('data-transition')!)
    expect(t.duration).toBeGreaterThan(0)
  })

  it('skips the animation entirely when the user prefers reduced motion', async () => {
    const { useReducedMotion } = await import('motion/react')
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} color="red" />)
    const polyline = container.querySelector('polyline')!
    const path = container.querySelector('path')!
    // With reduce=true, `initial` must be the boolean `false` — Motion's own
    // documented signal to skip the enter animation and render the `animate`
    // target immediately, never a numeric 0 that would still animate from.
    expect(JSON.parse(polyline.getAttribute('data-initial')!)).toBe(false)
    expect(JSON.parse(path.getAttribute('data-initial')!)).toBe(false)
    const t = JSON.parse(polyline.getAttribute('data-transition')!)
    expect(t.duration).toBe(0)
  })
})

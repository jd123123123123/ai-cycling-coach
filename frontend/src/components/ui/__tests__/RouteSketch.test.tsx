import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import RouteSketch from '../RouteSketch'

describe('RouteSketch', () => {
  afterEach(cleanup)

  it('renders nothing without at least two points', () => {
    const { container } = render(
      <RouteSketch polyline={[[47.1, 9.1]]} width={64} height={64} color="#16E08A" />,
    )
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('renders nothing for a null polyline', () => {
    const { container } = render(
      <RouteSketch polyline={null} width={64} height={64} color="#16E08A" />,
    )
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('fits the track inside the box', () => {
    const { container } = render(
      <RouteSketch
        polyline={[[47.0, 9.0], [47.1, 9.2], [47.05, 9.1]]}
        width={64} height={64} color="#16E08A"
      />,
    )
    const pts = container.querySelector('polyline')!.getAttribute('points')!
    const coords = pts.split(' ').flatMap((p) => p.split(',').map(Number))
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...coords)).toBeLessThanOrEqual(64)
  })

  it('flips latitude: the northernmost point sits highest on screen', () => {
    const { container } = render(
      <RouteSketch
        polyline={[[47.0, 9.0], [47.2, 9.1]]}
        width={64} height={64} color="#16E08A"
      />,
    )
    const [x1, y1, x2, y2] = container
      .querySelector('polyline')!
      .getAttribute('points')!
      .split(' ')
      .flatMap((p) => p.split(',').map(Number))
    // SVG y grows downward while latitude grows northward, so the higher
    // latitude must have the SMALLER y. A missing flip mirrors every route.
    expect(y2).toBeLessThan(y1)
    expect(x2).toBeGreaterThan(x1)
  })
})

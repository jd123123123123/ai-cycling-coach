import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import RehearsalProfile from '../RehearsalProfile'
import type { RehearsalSegment } from '../../../api/rehearsal'

const seg = (i: number, gradient: number): RehearsalSegment => ({
  start_m: i * 150, gradient_pct: gradient, power_w: 240, speed_ms: 6,
  elapsed_s: i * 25, w_bal_j: 20000 - i * 100, climb_id: gradient > 3 ? 1 : null,
})

const segments = [seg(0, 0), seg(1, 6), seg(2, 9), seg(3, -4)]
const elevations = [1000, 1010, 1030, 1020]

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
})

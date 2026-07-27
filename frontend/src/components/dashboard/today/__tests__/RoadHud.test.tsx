import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import RoadHud from '../RoadHud'
import { buildRoadProfile } from '../../../../utils/roadProfile'
import type { RoadPayload } from '../../AuraContext'
import type { ResolvedBlock } from '../../../../api/coach'

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'Warm-up', duration_s: 300,
    target_watts_low: 150, target_watts_high: 170, target_pct_ftp: 60,
    zone: 1, rpe: 2, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}
const blocks = [block(), block({ name: 'VO2', target_watts_low: 300, target_watts_high: 320, zone: 5, rpe: 8 })]

function payload(over: Partial<RoadPayload> = {}): RoadPayload {
  return {
    profile: buildRoadProfile(blocks, { cp: 250, wPrime: 20000 }),
    mode: 'prescribed',
    color: '#16E08A',
    blocks,
    ...over,
  }
}

afterEach(cleanup)

describe('RoadHud — Today Road mounting (finding 2 wiring, not the RoadReadout component itself)', () => {
  it('renders the readout when the road has samples', () => {
    render(<RoadHud road={payload()} travel={0} de={false} />)
    expect(screen.getByText('Warm-up')).toBeTruthy()
  })

  it('renders nothing when road is null — honest absence, no empty glass pill', () => {
    const { container } = render(<RoadHud road={null} travel={0} de={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the profile has zero samples — e.g. a flat/no-terrain mode', () => {
    const empty = payload({ profile: buildRoadProfile([], { cp: 250, wPrime: 20000 }) })
    const { container } = render(<RoadHud road={empty} travel={0} de={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('travel reaches the readout: scrubbing to a later position shows the later block', () => {
    const { rerender } = render(<RoadHud road={payload()} travel={0} de={false} />)
    expect(screen.getByText('Warm-up')).toBeTruthy()

    rerender(<RoadHud road={payload()} travel={1} de={false} />)
    expect(screen.getByText('VO2')).toBeTruthy()
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import RoadReadout, { readoutAt } from '../RoadReadout'
import { buildRoadProfile } from '../../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../../api/coach'

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'B', duration_s: 300,
    target_watts_low: 300, target_watts_high: 320, target_pct_ftp: 120,
    zone: 5, rpe: 8, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}
const blocks = [block({ name: 'Warm-up', target_watts_low: 150, target_watts_high: 170, zone: 1, rpe: 2 }), block({ name: 'VO2' })]

afterEach(cleanup)

describe('readoutAt', () => {
  it('resolves the block under the scrub position', () => {
    const p = buildRoadProfile(blocks, { cp: 250, wPrime: 20000 })
    expect(readoutAt(p, blocks, 0)!.blockName).toBe('Warm-up')
    expect(readoutAt(p, blocks, 1)!.blockName).toBe('VO2')
  })

  it('reports matches as a fraction of W prime', () => {
    const p = buildRoadProfile(blocks, { cp: 250, wPrime: 20000 })
    const start = readoutAt(p, blocks, 0)!
    const end = readoutAt(p, blocks, 1)!
    expect(start.matches).toBeCloseTo(1, 2)
    expect(end.matches!).toBeLessThan(start.matches!)
  })

  it('reports null matches when CP is unknown', () => {
    const p = buildRoadProfile(blocks, { cp: null, wPrime: null })
    expect(readoutAt(p, blocks, 0.5)!.matches).toBeNull()
  })

  it('returns null for an empty profile', () => {
    expect(readoutAt(buildRoadProfile([], { cp: 250, wPrime: 20000 }), [], 0.5)).toBeNull()
  })
})

describe('RoadReadout', () => {
  it('renders watts, zone and matches as real text', () => {
    const p = buildRoadProfile(blocks, { cp: 250, wPrime: 20000 })
    render(<RoadReadout profile={p} blocks={blocks} travel={1} de={false} />)
    expect(screen.getByText(/310\s*W/)).toBeTruthy()
    expect(screen.getByText('Z5')).toBeTruthy()
    expect(screen.getByTestId('road-matches').textContent).not.toBe('—')
  })

  it('renders an em dash for matches when CP is unknown, never a fake battery', () => {
    const p = buildRoadProfile(blocks, { cp: null, wPrime: null })
    render(<RoadReadout profile={p} blocks={blocks} travel={0.5} de={false} />)
    expect(screen.getByTestId('road-matches').textContent).toBe('—')
  })
})

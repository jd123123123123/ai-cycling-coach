// frontend/src/editorial/__tests__/cassette.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it, expect } from 'vitest'
import Cassette from '../components/Cassette'

afterEach(cleanup)

describe('Cassette', () => {
  it('draws ten cogs', () => {
    render(<Cassette activeIndex={3} />)
    expect(screen.getAllByTestId('cassette-cog')).toHaveLength(10)
  })

  it('lights the active cog as a rect, so the glow filter has a bounding box', () => {
    render(<Cassette activeIndex={3} />)
    const chain = screen.getByTestId('cassette-chain')
    // A <line> has a zero-height bbox, which collapses an objectBoundingBox
    // filter region and silently erases the element. This is not cosmetic.
    expect(chain.tagName.toLowerCase()).toBe('rect')
    expect(Number(chain.getAttribute('height'))).toBeGreaterThan(0)
  })

  it('scopes the glow filter to user space with an explicit region', () => {
    const { container } = render(<Cassette activeIndex={3} />)
    const filter = container.querySelector('filter')
    expect(filter?.getAttribute('filterUnits')).toBe('userSpaceOnUse')
    expect(Number(filter?.getAttribute('width'))).toBeGreaterThan(0)
  })

  it('gives two cassettes different filter ids', () => {
    const { container } = render(
      <>
        <Cassette activeIndex={2} idSuffix="a" />
        <Cassette activeIndex={5} idSuffix="b" />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('filter')).map((f) => f.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('draws no chain at all when there is no verdict', () => {
    render(<Cassette activeIndex={null} />)
    expect(screen.queryByTestId('cassette-chain')).toBeNull()
    expect(screen.getAllByTestId('cassette-cog')).toHaveLength(10)
  })

  it('marks the 90-day best without lighting it', () => {
    render(<Cassette activeIndex={5} bestIndex={1} />)
    const best = screen.getByTestId('cassette-best')
    expect(best).toBeTruthy()
    expect(screen.getByTestId('cassette-chain')).not.toBe(best)
  })

  it('omits the best marker when there is no history', () => {
    render(<Cassette activeIndex={5} bestIndex={null} />)
    expect(screen.queryByTestId('cassette-best')).toBeNull()
  })

  it('widens each cog as the teeth grow', () => {
    render(<Cassette activeIndex={0} />)
    const widths = screen.getAllByTestId('cassette-cog').map((c) => {
      const x1 = Number(c.getAttribute('x1'))
      const x2 = Number(c.getAttribute('x2'))
      return x2 - x1
    })
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1])
    }
  })

  it('clamps an out-of-range activeIndex onto the nearest real cog instead of drawing off-canvas', () => {
    render(<Cassette activeIndex={15} />)
    const cogs = screen.getAllByTestId('cassette-cog')
    const lastCog = cogs[cogs.length - 1]
    const chain = screen.getByTestId('cassette-chain')
    const chainCenterY = Number(chain.getAttribute('y')) + Number(chain.getAttribute('height')) / 2
    expect(chainCenterY).toBeCloseTo(Number(lastCog.getAttribute('y1')), 5)
    expect(Number(chain.getAttribute('width'))).toBe(
      Number(lastCog.getAttribute('x2')) - Number(lastCog.getAttribute('x1')),
    )
  })

  it('clamps a negative activeIndex onto the first real cog instead of drawing off-canvas', () => {
    render(<Cassette activeIndex={-1} />)
    const cogs = screen.getAllByTestId('cassette-cog')
    const firstCog = cogs[0]
    const chain = screen.getByTestId('cassette-chain')
    const chainCenterY = Number(chain.getAttribute('y')) + Number(chain.getAttribute('height')) / 2
    expect(chainCenterY).toBeCloseTo(Number(firstCog.getAttribute('y1')), 5)
    expect(Number(chain.getAttribute('width'))).toBe(
      Number(firstCog.getAttribute('x2')) - Number(firstCog.getAttribute('x1')),
    )
  })

  it('gives two cassettes different filter ids even with no idSuffix passed', () => {
    const { container } = render(
      <>
        <Cassette activeIndex={2} />
        <Cassette activeIndex={5} />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('filter')).map((f) => f.id)
    expect(new Set(ids).size).toBe(2)
  })
})

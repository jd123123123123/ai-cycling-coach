import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import RouteMap from '../RouteMap'

/**
 * The licence notice is the one part of this component that must survive
 * every refactor: shipping the map without it is a licence breach, and it is
 * exactly the sort of detail that disappears quietly during a redesign.
 *
 * MapLibre never initialises in jsdom (no WebGL), which is precisely the
 * condition worth testing — the notice must be a sibling of the map container,
 * not something the map draws, so it is there whether or not tiles ever load.
 */
const polyline: [number, number][] = [
  [46.5, 11.8],
  [46.6, 11.9],
]

afterEach(cleanup)

describe('RouteMap attribution', () => {
  it('names both parties, visibly, without waiting for a tap', () => {
    render(<RouteMap polyline={polyline} />)
    expect(screen.getByText('© Maptoolkit')).toBeTruthy()
    expect(screen.getByText('© OpenStreetMap')).toBeTruthy()
  })

  it('links each party to its own copyright page', () => {
    render(<RouteMap polyline={polyline} />)
    expect(screen.getByText('© Maptoolkit').getAttribute('href')).toBe(
      'https://www.maptoolkit.com/copyright/',
    )
    expect(screen.getByText('© OpenStreetMap').getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )
  })

  it('opens the copyright pages safely in a new tab', () => {
    render(<RouteMap polyline={polyline} />)
    for (const label of ['© Maptoolkit', '© OpenStreetMap']) {
      const link = screen.getByText(label)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }
  })

  it('shows the notice even though the basemap cannot load here', () => {
    // No WebGL in jsdom — same situation as a blocked tile host on a real
    // phone. The licence notice is not conditional on the map succeeding.
    render(<RouteMap polyline={polyline} />)
    expect(screen.getByText('© Maptoolkit')).toBeTruthy()
  })

  it('draws nothing at all, notice included, without a route', () => {
    // No map is rendered, so there is nothing to attribute.
    const { container } = render(<RouteMap polyline={[]} />)
    expect(container.innerHTML).toBe('')
  })
})

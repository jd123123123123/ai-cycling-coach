import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ArchiveDeckView from '../archive/ArchiveDeckView'
import { MONTH_FIXTURE } from '../archive/archiveFixture'
import RideScatter from '../archive/charts/RideScatter'
import PowerCurve from '../archive/charts/PowerCurve'

afterEach(cleanup)

const hits = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('circle[fill="transparent"], rect[fill="transparent"]'))

describe('the charts answer back', () => {
  it('tapping a ride reads that ride out', () => {
    const { container } = render(<RideScatter rides={MONTH_FIXTURE.wentIn.rides} highlightKey={null} />)
    expect(screen.getByTestId('scatter-readout').textContent).toContain('Tap a ride')
    fireEvent.pointerDown(hits(container)[0])
    const out = screen.getByTestId('scatter-readout').textContent ?? ''
    // the first ride in the fixture: 62 km, 240 m, load 64
    expect(out).toContain('62 km')
    expect(out).toContain('240 m')
  })

  it('tapping the same ride twice clears it, so the chart is never stuck', () => {
    const { container } = render(<RideScatter rides={MONTH_FIXTURE.wentIn.rides} highlightKey={null} />)
    fireEvent.pointerDown(hits(container)[0])
    expect(screen.getByTestId('scatter-readout').textContent).toContain('62 km')
    fireEvent.pointerDown(hits(container)[0])
    expect(screen.getByTestId('scatter-readout').textContent).toContain('Tap a ride')
  })

  it('tapping a duration on the power curve compares it with the prior period', () => {
    const { container } = render(
      <PowerCurve current={MONTH_FIXTURE.cameOut.current} previous={MONTH_FIXTURE.cameOut.previous} />,
    )
    expect(screen.getByTestId('curve-readout').textContent).toContain('Tap a duration')
    // index 3 = 60 s: 596 W now vs 587 W before
    fireEvent.pointerDown(hits(container)[3])
    const out = screen.getByTestId('curve-readout').textContent ?? ''
    expect(out).toContain('1m')
    expect(out).toContain('596 W')
    expect(out).toContain('+9 W')
  })

  it('the share card chart is an image, not a control', () => {
    render(<ArchiveDeckView model={MONTH_FIXTURE} />)
    const card = screen.getByTestId('share-card')
    // no tap targets and no "Tap a ride" prompt inside the card
    expect(card.querySelectorAll('circle[fill="transparent"]')).toHaveLength(0)
    expect(within(card).queryByTestId('scatter-readout')).toBeNull()
  })

  it('every chapter carries a scroll hint naming where it goes, except the last', () => {
    render(<ArchiveDeckView model={MONTH_FIXTURE} />)
    expect(screen.getAllByTestId('archive-chapter')).toHaveLength(6)
    const hints = screen.getAllByTestId('scroll-hint')
    expect(hints).toHaveLength(5)
    expect(hints[0].textContent?.toLowerCase()).toContain('what went in')
  })

  it('the rail marks one chapter and fills behind it', () => {
    render(<ArchiveDeckView model={MONTH_FIXTURE} />)
    const ticks = screen.getAllByTestId('rail-tick')
    expect(ticks).toHaveLength(6)
    expect(ticks.filter((t) => t.getAttribute('data-active') === 'true')).toHaveLength(1)
  })
})

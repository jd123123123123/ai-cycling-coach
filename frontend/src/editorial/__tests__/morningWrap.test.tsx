import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MorningWrapView from '../pages/MorningWrapView'
import { MORNING_WRAP_FIXTURE, MORNING_WRAP_NO_DATA } from '../pages/morningWrapFixture'

afterEach(cleanup)

describe('Morning Wrap', () => {
  it('leads with the call, before any of the evidence', () => {
    render(<MorningWrapView model={MORNING_WRAP_FIXTURE} />)
    const call = screen.getByTestId('the-call')
    const firstSignal = screen.getAllByTestId('signal-row')[0]
    // A rider checking their phone at 06:32 must not scroll past four signal
    // rows to learn they are meant to rest.
    expect(call.compareDocumentPosition(firstSignal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws the night as it happened, not as a total', () => {
    render(<MorningWrapView model={MORNING_WRAP_FIXTURE} />)
    expect(screen.getAllByTestId('hypnogram-bar').length).toBeGreaterThan(4)
    // deep is the stage the coaching keys off, so it carries the accent
    expect(screen.getAllByTestId('hypnogram-bar').some((b) => b.getAttribute('data-stage') === 'deep')).toBe(true)
  })

  it('places a reading outside its band outside the band, never clamped to the edge', () => {
    render(<MorningWrapView model={MORNING_WRAP_FIXTURE} />)
    const row = screen.getAllByTestId('signal-row')[0] // HRV 71, band 52–66
    const band = row.querySelector('[data-testid="signal-band"]') as HTMLElement
    const marker = row.querySelector('[data-testid="signal-marker"]') as HTMLElement
    const bandRight = parseFloat(band.style.left) + parseFloat(band.style.width)
    const markerLeft = parseFloat(marker.style.left.replace('calc(', ''))
    expect(markerLeft).toBeGreaterThan(bandRight)
  })

  it('gives every task a measurable, so "done" is never a judgement call', () => {
    render(<MorningWrapView model={MORNING_WRAP_FIXTURE} />)
    const tasks = screen.getAllByTestId('day-task')
    expect(tasks).toHaveLength(5)
    expect(tasks.filter((t) => t.getAttribute('data-now') === 'true')).toHaveLength(1)
  })

  describe('when the watch synced nothing', () => {
    it('withholds a claim whenever its evidence is withheld', () => {
      render(<MorningWrapView model={MORNING_WRAP_NO_DATA} />)
      // the claims that assert a reading must not survive their own data
      expect(screen.queryByText(/Two signals broke your range/)).toBeNull()
      expect(screen.queryByText(/Freshest you have been/)).toBeNull()
      expect(screen.queryByTestId('the-call')).toBeNull()
    })

    it('never invents a number, and says why instead', () => {
      render(<MorningWrapView model={MORNING_WRAP_NO_DATA} />)
      expect(screen.getByText('No sleep recorded since Tuesday.')).toBeTruthy()
      expect(screen.getByText('No wearable reading since Tuesday.')).toBeTruthy()
      expect(screen.queryByTestId('hypnogram')).toBeNull()
    })

    it('still holds the frame — the day is planned even when the night was not measured', () => {
      render(<MorningWrapView model={MORNING_WRAP_NO_DATA} />)
      expect(screen.getAllByTestId('day-task')).toHaveLength(5)
      expect(screen.getByTestId('morning-cta')).toBeTruthy()
    })
  })
})

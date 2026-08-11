import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MorningDeckView from '../morning/MorningDeckView'
import { MORNING_WRAP_FIXTURE, MORNING_WRAP_NO_DATA } from '../morning/fixture'

afterEach(cleanup)

describe('Morning Wrap deck', () => {
  it('gives every chapter its own snap page, with a rail entry each', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const chapters = screen.getAllByTestId('morning-chapter')
    expect(chapters).toHaveLength(7)
    expect(screen.getAllByTestId('rail-item')).toHaveLength(chapters.length)
    // Exactly one chapter is current, and on arrival it is the first.
    const active = screen.getAllByTestId('rail-item').filter((b) => b.getAttribute('data-active') === 'true')
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toBe('Wake')
  })

  it('leads with the call, before any of the evidence', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const call = screen.getByTestId('the-call')
    const firstSignal = screen.getAllByTestId('signal-row')[0]
    // A rider checking their phone at 06:32 must not flick past the night and
    // four signal rows to learn they are meant to rest.
    expect(call.compareDocumentPosition(firstSignal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('promises the NEXT chapter by name and by number, so the flick is owed something', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const peek = screen.getByTestId('peek-strip')
    expect(peek.textContent).toContain('Your call')
    // readiness 88 — visible one chapter before you reach it
    expect(screen.getByTestId('peek-value').textContent).toBe('88')
  })

  it('lets the rail jump straight to a chapter, and re-aims the peek when it does', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    fireEvent.click(screen.getAllByTestId('rail-item')[3]) // "Signals"
    expect(screen.getByTestId('peek-strip').textContent).toContain('Where you stand')
    expect(screen.getByTestId('peek-value').textContent).toBe('+19')
  })

  it('drops the peek on the last chapter — the CTA is the ending, not a hand-off', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    fireEvent.click(screen.getAllByTestId('rail-item')[6])
    expect(screen.queryByTestId('peek-strip')).toBeNull()
    expect(screen.getByTestId('morning-cta')).toBeTruthy()
  })

  it('is operable from the keyboard, which the archive deck is not', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const deck = screen.getByTestId('morning-deck')
    expect(deck.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(deck, { key: 'End' })
    expect(screen.queryByTestId('peek-strip')).toBeNull()
    fireEvent.keyDown(deck, { key: 'Home' })
    expect(screen.getByTestId('peek-strip').textContent).toContain('Your call')
  })

  it('fronts every tile with a glyph and a direction, so the grid can be glanced at', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const tiles = screen.getAllByTestId('metric-tile')
    expect(tiles).toHaveLength(4)
    // glyph + direction arrow + spark — three marks that land before the label
    for (const t of tiles) expect(t.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3)
  })

  it('keeps a tile scannable by default and its sentence one tap away', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const hrv = screen.getAllByTestId('metric-tile')[0]
    expect(hrv.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/highest reading since this block started/)).toBeNull()
    fireEvent.click(hrv)
    expect(hrv.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/highest reading since this block started/)).toBeTruthy()
  })

  it('lets you interrogate the night block by block, with the clock it happened on', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    expect(screen.getByTestId('hypnogram-readout').textContent).toContain('Tap any block')
    const first = screen.getAllByTestId('hypnogram-bar')[0] // light, 18 min from 22:47
    fireEvent.click(first.parentElement!)
    const readout = screen.getByTestId('hypnogram-readout').textContent ?? ''
    expect(readout).toContain('Light')
    expect(readout).toContain('18 min')
    expect(readout).toContain('22:47 → 23:05')
    // selecting one block dims the others — the house tap-to-read rule
    expect(first.getAttribute('data-selected')).toBe('true')
    expect(screen.getAllByTestId('hypnogram-bar')[1].getAttribute('data-selected')).toBe('false')
  })

  it('lets you read any day of the form curve, and the numerals follow', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const plot = screen.getByTestId('form-plot')
    expect(screen.getByTestId('form-when').textContent).toBe('Today')
    expect(screen.queryByTestId('form-hairline')).toBeNull()
    // first Left lands on the newest day, the second steps back one
    fireEvent.keyDown(plot, { key: 'ArrowLeft' })
    fireEvent.keyDown(plot, { key: 'ArrowLeft' })
    expect(screen.getByTestId('form-when').textContent).toBe('1 day ago')
    expect(screen.getByTestId('form-hairline')).toBeTruthy()
    fireEvent.keyDown(plot, { key: 'Escape' })
    expect(screen.getByTestId('form-when').textContent).toBe('Today')
  })

  it('draws the night as it happened, not as a total', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    expect(screen.getAllByTestId('hypnogram-bar').length).toBeGreaterThan(4)
    // deep is the stage the coaching keys off, so it carries the accent
    expect(screen.getAllByTestId('hypnogram-bar').some((b) => b.getAttribute('data-stage') === 'deep')).toBe(true)
  })

  it('places a reading outside its band outside the band, never clamped to the edge', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const row = screen.getAllByTestId('signal-row')[0] // HRV 71, band 52–66
    const band = row.querySelector('[data-testid="signal-band"]') as HTMLElement
    const marker = row.querySelector('[data-testid="signal-marker"]') as HTMLElement
    const bandRight = parseFloat(band.style.left) + parseFloat(band.style.width)
    const markerLeft = parseFloat(marker.style.left.replace('calc(', ''))
    expect(markerLeft).toBeGreaterThan(bandRight)
  })

  it('gives every task a measurable, so "done" is never a judgement call', () => {
    render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    const tasks = screen.getAllByTestId('day-task')
    expect(tasks).toHaveLength(5)
    expect(tasks.filter((t) => t.getAttribute('data-now') === 'true')).toHaveLength(1)
  })

  describe('when the watch synced nothing', () => {
    it('withholds a claim whenever its evidence is withheld', () => {
      render(<MorningDeckView model={MORNING_WRAP_NO_DATA} />)
      // the claims that assert a reading must not survive their own data
      expect(screen.queryByText(/Two of your signals broke their range/)).toBeNull()
      expect(screen.queryByText(/freshest you have been/)).toBeNull()
      expect(screen.queryByTestId('the-call')).toBeNull()
    })

    it('never invents a number, and says why instead', () => {
      render(<MorningDeckView model={MORNING_WRAP_NO_DATA} />)
      expect(screen.getByText('Your watch has not recorded a night since Tuesday.')).toBeTruthy()
      expect(screen.getByText('No reading from your watch since Tuesday.')).toBeTruthy()
      expect(screen.queryByTestId('hypnogram')).toBeNull()
    })

    it('never promises a figure the next chapter cannot show', () => {
      render(<MorningDeckView model={MORNING_WRAP_NO_DATA} />)
      // The chapter is still named — the deck's shape is honest even when the
      // night is not measured — but the readiness number is simply absent.
      expect(screen.getByTestId('peek-strip').textContent).toContain('Your call')
      expect(screen.queryByTestId('peek-value')).toBeNull()
    })

    it('still holds the frame — the day is planned even when the night was not measured', () => {
      render(<MorningDeckView model={MORNING_WRAP_NO_DATA} />)
      expect(screen.getAllByTestId('morning-chapter')).toHaveLength(7)
      expect(screen.getAllByTestId('day-task')).toHaveLength(5)
      expect(screen.getByTestId('morning-cta')).toBeTruthy()
    })
  })
})

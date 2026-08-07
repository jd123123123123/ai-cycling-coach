// frontend/src/editorial/__tests__/cassetteHero.test.tsx
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import CassetteHero from '../components/CassetteHero'
import { present, missing } from '../data/value'

const series = Array.from({ length: 30 }, (_, i) => 40 + i)

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())
afterEach(cleanup)

describe('CassetteHero', () => {
  it('shows the top-band verdict word and the chain', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: 8 })}
        series={present(series)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    // 74 against a 40-69 series ranks at the top (percentile 1.0 → cog 0),
    // which is the 'Bereit' (Ready) band — not just "some truthy word".
    expect(screen.getByTestId('cassette-hero-verdict').textContent).toBe('Bereit')
    expect(screen.getByTestId('cassette-chain')).toBeTruthy()
    expect(screen.getByText('Heute geht das 17er.')).toBeTruthy()
  })

  // OWNER RULING 2026-08-07: the hero's own numeral (56px, `useCountUp`-
  // animated) is gone. It repeated the SAME reading the Cover's own numeral
  // already shows a few pixels up on Rest/Training/Resting — the exact
  // collision the design's own §0 promised would never happen — and made
  // every static screenshot (this project's review method) show a
  // permanent "0", `useCountUp`'s pre-timer starting value. The cog IS the
  // reading; this asserts the duplication cannot silently return.
  it('renders no numeral of its own — the cog is the reading, not a second number', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: 8 })}
        series={present(series)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    expect(screen.queryByTestId('cassette-hero-numeral')).toBeNull()
  })

  it('shows a different verdict word for a lower band', () => {
    render(
      <CassetteHero
        // Below every value in the series → percentile 0 → cog 9, the
        // 'Leer' (Empty) band — a different band from the test above,
        // proving the word actually tracks the band instead of being
        // hardcoded.
        readiness={present({ score: 30, deltaVsYesterday: null })}
        series={present(series)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 34er.')}
      />,
    )
    expect(screen.getByTestId('cassette-hero-verdict').textContent).toBe('Leer')
  })

  it('withholds the verdict entirely when readiness is missing', () => {
    render(
      <CassetteHero
        readiness={missing('Keine Messung seit Dienstag.')}
        series={present(series)}
        todayIso="2026-08-07"
        caption={missing('Noch keine Einordnung.')}
      />,
    )
    expect(screen.queryByTestId('cassette-chain')).toBeNull()
    expect(screen.queryByTestId('cassette-hero-verdict')).toBeNull()
    expect(screen.getByText('Keine Messung seit Dienstag.')).toBeTruthy()
  })

  it('still draws the cassette when the reading is missing, so the frame stays', () => {
    render(
      <CassetteHero
        readiness={missing('Keine Messung seit Dienstag.')}
        series={present(series)}
        todayIso="2026-08-07"
        caption={missing('Noch keine Einordnung.')}
      />,
    )
    expect(screen.getAllByTestId('cassette-cog')).toHaveLength(10)
  })

  it('omits the delta rather than inventing a zero', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: null })}
        series={present(series)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    expect(screen.queryByTestId('cassette-hero-delta')).toBeNull()
  })

  it('says so when the placement is coarse for lack of history', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: 3 })}
        series={present([50, 60, 70])}
        todayIso="2026-08-07"
        caption={present('Heute geht das 15er.')}
      />,
    )
    expect(screen.getByTestId('cassette-hero-basis')).toBeTruthy()
    // Coarse (decile) placement still has a real series to compute a
    // median from, so the typical-reading marker still draws — only a
    // missing/empty series withholds it (see the dedicated test below).
    expect(screen.getByTestId('cassette-best')).toBeTruthy()
  })

  it('places the typical-reading marker off cog zero, below where an above-typical reading sits', () => {
    render(
      <CassetteHero
        // 74 ranks at the very top of the 40-69 series (cog 0). The
        // series' own median (54.5) ranks in the middle of the range —
        // proving the marker is the athlete's typical reading, not their
        // best (which — ranked against its own series — would always sit
        // at cog 0 too, and could never move).
        readiness={present({ score: 74, deltaVsYesterday: null })}
        series={present(series)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    const marker = screen.getByTestId('cassette-best')
    const chain = screen.getByTestId('cassette-chain')
    const markerY = Number(marker.getAttribute('y1'))
    // The chain <rect>'s `y` is its top edge (activeY - 5.5); comparing the
    // two coordinates directly is enough to establish ordering without
    // hardcoding either cog's exact pixel position.
    const chainY = Number(chain.getAttribute('y')) + 5.5

    // Cog 0 sits at the very top of the cassette; the marker must not be
    // there, i.e. the median-based placement actually moved off cog zero.
    expect(markerY).toBeGreaterThan(chainY)
    // Today's reading (above the series median) sits on a smaller — i.e.
    // higher-up-the-cassette — cog than the marker.
    expect(chainY).toBeLessThan(markerY)
  })

  it('labels the typical-reading marker with the German copy when a median exists', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: null })}
        series={present(series)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    expect(screen.getByTestId('cassette-typical-label').textContent).toBe('DEIN SCHNITT')
  })

  it('draws no marker when the series is missing, so nothing is invented', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: null })}
        series={missing('Noch keine Historie erfasst.')}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    expect(screen.queryByTestId('cassette-best')).toBeNull()
  })

  it('renders the missing readiness reason in the quiet colour, not the normal-content colour', () => {
    render(
      <CassetteHero
        readiness={missing('Keine Messung seit Dienstag.')}
        series={present(series)}
        todayIso="2026-08-07"
        caption={missing('Noch keine Einordnung.')}
      />,
    )
    expect(screen.getByText('Keine Messung seit Dienstag.').style.color).toBe('var(--e-quiet)')
    expect(screen.getByText('Noch keine Einordnung.').style.color).toBe('var(--e-quiet)')
  })

  it('renders a present caption in the normal-content colour, not the quiet reason colour', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: null })}
        series={present(series)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    const caption = screen.getByText('Heute geht das 17er.')
    expect(caption.style.color).toBe('var(--e-mid)')
    expect(caption.style.color).not.toBe('var(--e-quiet)')
  })
})

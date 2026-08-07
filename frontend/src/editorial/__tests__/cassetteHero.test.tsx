// frontend/src/editorial/__tests__/cassetteHero.test.tsx
import { render, screen, act, cleanup } from '@testing-library/react'
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
  it('shows the score, a verdict word and the chain', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: 8 })}
        series={present(series)}
        best={present(69)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    // jsdom has no matchMedia, and `prefersReducedMotion()` treats "can't ask"
    // as "no preference" — so the count-up really runs here and starts at 0.
    // Let it land before asserting the number.
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.getByTestId('cassette-hero-numeral').textContent).toContain('74')
    expect(screen.getByTestId('cassette-hero-verdict').textContent).toBeTruthy()
    expect(screen.getByTestId('cassette-chain')).toBeTruthy()
    expect(screen.getByText('Heute geht das 17er.')).toBeTruthy()
  })

  it('withholds the verdict entirely when readiness is missing', () => {
    render(
      <CassetteHero
        readiness={missing('Keine Messung seit Dienstag.')}
        series={present(series)}
        best={present(69)}
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
        best={present(69)}
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
        best={present(69)}
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
        best={missing('Noch keine 90-Tage-Historie erfasst.')}
        todayIso="2026-08-07"
        caption={present('Heute geht das 15er.')}
      />,
    )
    expect(screen.getByTestId('cassette-hero-basis')).toBeTruthy()
    expect(screen.queryByTestId('cassette-best')).toBeNull()
  })
})

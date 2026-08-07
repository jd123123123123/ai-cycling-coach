// frontend/src/editorial/__tests__/cassetteToday.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import TodayView from '../pages/TodayView'
import type { DayState } from '../state/dayState'
import { makeTodayModel } from './helpers/makeTodayModel'

const STATES: DayState[] = ['rest', 'training', 'trained', 'resting', 'evening']

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe('Today mounts the cassette', () => {
  it.each(STATES)('renders the cassette in %s', (state) => {
    render(
      <MemoryRouter>
        <TodayView model={makeTodayModel({ state })} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('cassette')).toBeTruthy()
    expect(screen.getByTestId('cassette-chain')).toBeTruthy()
  })

  it.each(STATES)('keeps the pen Cover — photo and display numeral — in %s', (state) => {
    const { container } = render(
      <MemoryRouter>
        <TodayView model={makeTodayModel({ state })} />
      </MemoryRouter>,
    )
    // The Cover's background photograph and its own big numeral are the pen's
    // header treatment and survive this task untouched. `[data-photo]` is the
    // attribute Cover.tsx already puts on its photo layer (Cover.tsx:134).
    expect(container.querySelector('[data-photo]')).toBeTruthy()
    expect(container.querySelector('[data-testid="hero-numeral"]')).toBeTruthy()
  })

  it('keeps the cassette numeral below the Cover numeral in scale', () => {
    const { container } = render(
      <MemoryRouter>
        <TodayView model={makeTodayModel({ state: 'training' })} />
      </MemoryRouter>,
    )
    const px = (el: Element | null) => Number((el as HTMLElement)?.style.fontSize.replace('px', '') || 0)
    expect(px(container.querySelector('[data-testid="cassette-hero-numeral"]')))
      .toBeLessThan(px(container.querySelector('[data-testid="hero-numeral"]')))
  })

  it('drops the chain to a bigger cog once the day is ridden', () => {
    const cogOf = (state: DayState) => {
      const { unmount } = render(
        <MemoryRouter>
          <TodayView model={makeTodayModel({ state, readinessScore: state === 'trained' ? 41 : 74 })} />
        </MemoryRouter>,
      )
      const width = Number(screen.getByTestId('cassette-chain').getAttribute('width'))
      unmount()
      window.localStorage.clear()
      return width
    }
    // A bigger cog is a wider rect: what is left after the session.
    expect(cogOf('trained')).toBeGreaterThan(cogOf('training'))
  })
})

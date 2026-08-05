import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import DayRail from '../components/DayRail'
import SecHead from '../components/SecHead'
import StatusBar from '../components/StatusBar'
import TabBar from '../components/TabBar'

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

afterEach(cleanup)

describe('chrome', () => {
  it('StatusBar shows the given time verbatim', () => {
    render(<StatusBar time="19:24" />)
    expect(screen.getByText('19:24')).toBeTruthy()
  })

  it('TabBar renders all five destinations and marks the active one', () => {
    wrap(<TabBar active="today" />)
    for (const label of ['TODAY', 'TRAIN', 'RECOVERY', 'HISTORY', 'SOCIAL']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('TODAY').closest('a')?.getAttribute('aria-current')).toBe('page')
  })

  it('TabBar points the four undesigned tabs inside the editorial tree', () => {
    wrap(<TabBar active="today" />)
    expect(screen.getByText('TRAIN').closest('a')?.getAttribute('href')).toBe('/e/train')
  })

  // DayRail deviates from the brief here — see the block comment atop
  // DayRail.tsx. The pen's "DayRail" (uKzuZ) is a four-step rail through
  // today's own phases (REST DAY|TRAINING DAY → SESSION → RECOVERY →
  // LIGHTS OUT), not a seven-day calendar strip. This test asserts the
  // real component: four steps always render, and exactly one is active,
  // at the index the Today state maps to.
  it('DayRail renders all four phase steps with exactly one active', () => {
    const { container } = render(<DayRail state="rest" />)
    expect(container.querySelectorAll('[data-step]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(1)
  })

  it('DayRail advances the active step and the day-type label with the Today state', () => {
    const { container: restContainer } = render(<DayRail state="rest" />)
    expect(restContainer.querySelector('[data-step="daytype"]')?.getAttribute('data-active')).toBe('true')
    expect(screen.getByText('REST DAY')).toBeTruthy()
    cleanup()

    const { container: eveningContainer } = render(<DayRail state="evening" />)
    expect(eveningContainer.querySelector('[data-step="lights-out"]')?.getAttribute('data-active')).toBe('true')
    expect(screen.getByText('TRAINING DAY')).toBeTruthy()
  })

  it('SecHead renders the number, the title, and the optional chip and sub', () => {
    render(<SecHead index="01" title="YOUR BODY" chip="AHEAD" sub="What this section covers." />)
    expect(screen.getByText('01')).toBeTruthy()
    expect(screen.getByText('YOUR BODY')).toBeTruthy()
    expect(screen.getByText('AHEAD')).toBeTruthy()
    expect(screen.getByText('What this section covers.')).toBeTruthy()
  })

  it('SecHead without a chip or sub renders neither', () => {
    const { container } = render(<SecHead index="02" title="THE COST" />)
    expect(container.querySelector('[data-sechead-chip]')).toBeNull()
    expect(container.querySelector('[data-sechead-sub]')).toBeNull()
  })
})

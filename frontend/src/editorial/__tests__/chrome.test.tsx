import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DayRail from '../components/DayRail'
import SecHead from '../components/SecHead'
import TabBar from '../components/TabBar'
import { dayRailStepTargets } from '../state/dayState'

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

afterEach(cleanup)

describe('chrome', () => {
  it('TabBar renders all five destinations and marks the active one', () => {
    wrap(<TabBar active="today" />)
    for (const label of ['HEUTE', 'TRAINING', 'ERHOLUNG', 'VERLAUF', 'CREW']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('HEUTE').closest('a')?.getAttribute('aria-current')).toBe('page')
  })

  it('TabBar points the four undesigned tabs inside the editorial tree', () => {
    wrap(<TabBar active="today" />)
    expect(screen.getByText('TRAINING').closest('a')?.getAttribute('href')).toBe('/e/train')
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
    expect(screen.getByText('RUHETAG')).toBeTruthy()
    cleanup()

    const { container: eveningContainer } = render(<DayRail state="evening" />)
    expect(eveningContainer.querySelector('[data-step="lights-out"]')?.getAttribute('data-active')).toBe('true')
    expect(screen.getByText('TRAININGSTAG')).toBeTruthy()
  })

  // Topbar task: the rail is browsable. Each step is a real, keyboard-
  // reachable <button> with aria-current on the active one.
  it('DayRail steps are real buttons, and only the active one carries aria-current', () => {
    const { container } = render(<DayRail state="trained" />)
    const steps = container.querySelectorAll('[data-step]')
    expect(steps).toHaveLength(4)
    for (const step of steps) expect(step.tagName).toBe('BUTTON')
    expect(container.querySelector('[data-step="session"]')?.getAttribute('aria-current')).toBe('step')
    expect(container.querySelector('[data-step="daytype"]')?.getAttribute('aria-current')).toBeNull()
  })

  // Tapping a step must call onStepSelect with that step's OWN target
  // state — never mutate anything itself. Step 0 (day type) resolves from
  // `derived`, not from whatever is currently being previewed.
  it('DayRail tapping a step reports its target state, resolving day type from derived', () => {
    const onStepSelect = vi.fn()
    const { container } = render(<DayRail state="trained" derived="training" onStepSelect={onStepSelect} />)
    container.querySelector<HTMLButtonElement>('[data-step="daytype"]')!.click()
    expect(onStepSelect).toHaveBeenCalledWith('training')
    container.querySelector<HTMLButtonElement>('[data-step="recovery"]')!.click()
    expect(onStepSelect).toHaveBeenCalledWith('resting')
  })

  it('dayRailStepTargets resolves step 0 to the real (derived) day type only', () => {
    expect(dayRailStepTargets('rest')).toEqual(['rest', 'trained', 'resting', 'evening'])
    expect(dayRailStepTargets('training')).toEqual(['training', 'trained', 'resting', 'evening'])
  })

  // The preview affordance only appears while browsing, and dismissing it
  // calls onExitPreview (which the page wires to `preview(null)`) — never
  // onStepSelect or anything that would write a real override.
  it('DayRail shows the preview chip only while isPreviewing, and dismissing it exits the preview', () => {
    const onExitPreview = vi.fn()
    const { container, rerender } = render(<DayRail state="rest" isPreviewing={false} />)
    expect(container.querySelector('[data-preview-chip]')).toBeNull()

    rerender(<DayRail state="resting" isPreviewing onExitPreview={onExitPreview} />)
    const chip = container.querySelector<HTMLButtonElement>('[data-preview-chip]')
    expect(chip).not.toBeNull()
    expect(screen.getByText('VORSCHAU · ZURÜCK ZU HEUTE')).toBeTruthy()
    chip!.click()
    expect(onExitPreview).toHaveBeenCalledTimes(1)
  })

  it('DayRail preview chip renders immediately (final, visible state) under prefers-reduced-motion', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = (query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList
    try {
      const { container } = render(<DayRail state="rest" isPreviewing />)
      const chip = container.querySelector<HTMLElement>('[data-preview-chip]')
      expect(chip).not.toBeNull()
      expect(chip!.style.opacity).toBe('1')
    } finally {
      if (originalMatchMedia) window.matchMedia = originalMatchMedia
      // @ts-expect-error — restore jsdom's own absence of matchMedia.
      else delete window.matchMedia
    }
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

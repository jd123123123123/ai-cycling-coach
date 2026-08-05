import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Cover from '../components/Cover'
import QuotePlate from '../components/QuotePlate'
import TomorrowPlate from '../components/TomorrowPlate'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('Cover', () => {
  it('renders the frame and children over the ground when there is no photo', () => {
    const { container } = render(
      <Cover state="rest">
        <span>hello</span>
      </Cover>,
    )
    const el = container.querySelector('[data-cover]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.style.background).toContain('var(--e-ground)')
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('uses the pen-verified height per state', () => {
    const heights: Record<string, number> = { rest: 480, training: 455, trained: 436 }
    for (const [state, height] of Object.entries(heights)) {
      const { container } = render(<Cover state={state as 'rest' | 'training' | 'trained'}><span /></Cover>)
      const el = container.querySelector('[data-cover]') as HTMLElement
      expect(el.style.height).toBe(`${height}px`)
      cleanup()
    }
  })

  it('layers the photo/tint stack only when a photo URL is given', () => {
    const { container: withoutPhoto } = render(<Cover state="rest"><span /></Cover>)
    expect(withoutPhoto.querySelectorAll('[data-photo-layer]')).toHaveLength(0)

    const { container: withPhoto } = render(<Cover state="rest" photoUrl="./ride.jpg"><span /></Cover>)
    expect(withPhoto.querySelectorAll('[data-photo-layer]')).toHaveLength(2)
  })
})

describe('QuotePlate', () => {
  it('renders the tick, quote and attribution', () => {
    render(<QuotePlate state="rest" quote="Nothing you do today will make you faster." attribution="WHAT REST IS FOR" />)
    expect(screen.getByText('Nothing you do today will make you faster.')).toBeTruthy()
    expect(screen.getByText('WHAT REST IS FOR')).toBeTruthy()
  })

  it('is 322 tall regardless of state', () => {
    const { container } = render(<QuotePlate state="trained" quote="q" attribution="a" />)
    const el = container.querySelector('[data-quote-plate]') as HTMLElement
    expect(el.style.height).toBe('322px')
  })
})

describe('TomorrowPlate', () => {
  it('renders every present field', () => {
    render(
      <TomorrowPlate
        state="rest"
        kickerLeft={present('TOMORROW · 05:00')}
        kickerRight={present('THRESHOLD')}
        title={present('Four by eight, at 285.')}
        captionLeft={present('40 KM · 640 M')}
        captionRight={present('TODAY MAKES IT POSSIBLE')}
      />,
    )
    expect(screen.getByText('TOMORROW · 05:00')).toBeTruthy()
    expect(screen.getByText('THRESHOLD')).toBeTruthy()
    expect(screen.getByText('Four by eight, at 285.')).toBeTruthy()
    expect(screen.getByText('40 KM · 640 M')).toBeTruthy()
    expect(screen.getByText('TODAY MAKES IT POSSIBLE')).toBeTruthy()
  })

  it('keeps the frame and dashes each missing field, printing each distinct reason once', () => {
    const { container } = render(
      <TomorrowPlate
        state="training"
        kickerLeft={missing('No start time recorded for today\'s session.')}
        kickerRight={missing('No sunset time available.')}
        title={present('Threshold')}
        captionLeft={missing('No route data for today\'s ride.')}
        captionRight={missing('No route data for today\'s ride.')}
      />,
    )
    expect(container.querySelector('[data-tomorrow-plate]')).not.toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('No route data for today\'s ride.')).toBeTruthy()
    // deduped: the reason shared by two fields prints once, not twice.
    expect(screen.getAllByText('No route data for today\'s ride.')).toHaveLength(1)
  })
})

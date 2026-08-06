import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Cover from '../components/Cover'
import QuotePlate from '../components/QuotePlate'
import TomorrowPlate from '../components/TomorrowPlate'
import { missing, present } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import TodayView from '../pages/TodayView'

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

  it('uses the pen-verified height per state ONLY when a photo fills it', () => {
    const heights: Record<string, number> = { rest: 480, training: 455, trained: 436 }
    for (const [state, height] of Object.entries(heights)) {
      const { container } = render(
        <Cover state={state as 'rest' | 'training' | 'trained'} photoUrl="./ride.jpg"><span /></Cover>,
      )
      const el = container.querySelector('[data-cover]') as HTMLElement
      expect(el.style.height).toBe(`${height}px`)
      cleanup()
    }
  })

  it('collapses to its content height when there is no photo — never a fixed empty void', () => {
    const { container } = render(<Cover state="rest"><span /></Cover>)
    const el = container.querySelector('[data-cover]') as HTMLElement
    expect(el.style.height).toBe('')
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

  it('is 322 tall only when a photo fills it', () => {
    const { container } = render(<QuotePlate state="trained" quote="q" attribution="a" photoUrl="./ride.jpg" />)
    const el = container.querySelector('[data-quote-plate]') as HTMLElement
    expect(el.style.height).toBe('322px')
  })

  it('collapses to its content height with no photo — no void above the quote', () => {
    const { container } = render(<QuotePlate state="trained" quote="q" attribution="a" />)
    const el = container.querySelector('[data-quote-plate]') as HTMLElement
    expect(el.style.height).toBe('')
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

  it('renders present fields quietly (no dash) and prints ONE gap sentence when some fields are missing', () => {
    const { container } = render(
      <TomorrowPlate
        state="training"
        kickerLeft={missing('No start time recorded for today\'s session.')}
        kickerRight={missing('No sunset time available.')}
        title={present('Threshold')}
        captionLeft={missing('No route data for today\'s ride.')}
        captionRight={missing('No route data for today\'s ride.')}
        gapReason="Further route details aren't available yet."
      />,
    )
    expect(container.querySelector('[data-tomorrow-plate]')).not.toBeNull()
    expect(screen.getByText('Threshold')).toBeTruthy()
    // No per-field dash — coordinator visual review round 2: a plate with
    // several permanently-empty fields dashing every one of them, then
    // stacking every distinct reason into one paragraph, read as a wall of
    // apologies. Missing fields render quietly; ONE sentence covers the gap.
    expect(screen.queryByText('—')).toBeNull()
    const reasonParagraphs = container.querySelectorAll('[data-plate-reason]')
    expect(reasonParagraphs.length).toBe(1)
    expect(reasonParagraphs[0].textContent).toBe("Further route details aren't available yet.")
  })

  it('renders nothing at all when every field is missing — the frame is not lost, a sibling section carries it', () => {
    const { container } = render(
      <TomorrowPlate
        state="rest"
        kickerLeft={missing('a')}
        kickerRight={missing('b')}
        title={missing('c')}
        captionLeft={missing('d')}
        captionRight={missing('e')}
        gapReason="Further details for tomorrow aren't available yet."
      />,
    )
    expect(container.querySelector('[data-tomorrow-plate]')).toBeNull()
  })

  it('is 246 tall only when a photo fills it', () => {
    const { container } = render(
      <TomorrowPlate
        state="rest"
        kickerLeft={present('a')} kickerRight={present('b')} title={present('c')}
        captionLeft={present('d')} captionRight={present('e')} photoUrl="./ride.jpg"
      />,
    )
    const el = container.querySelector('[data-tomorrow-plate]') as HTMLElement
    expect(el.style.height).toBe('246px')
  })

  it('collapses to its content height with no photo', () => {
    const { container } = render(
      <TomorrowPlate
        state="rest"
        kickerLeft={present('a')} kickerRight={present('b')} title={present('c')}
        captionLeft={present('d')} captionRight={present('e')}
      />,
    )
    const el = container.querySelector('[data-tomorrow-plate]') as HTMLElement
    expect(el.style.height).toBe('')
  })
})

describe('Plate placement in TodayView', () => {
  // Pen-verified (2026-08-05): Quote Plate sits between section 01 and
  // section 02 on every day state, and Tomorrow Plate / Route Plate closes
  // section 03, before the Tomorrow Band / tab bar. Pinned here so a future
  // reorder fails a test instead of shipping invisibly — the exact defect
  // class the last three tasks each shipped once.
  const trainedModel: TodayModel = {
    state: 'trained',
    dateLabel: present('WED 22 JUL'),
    streakDays: present(13),
    readiness: present({ score: 74, deltaVsYesterday: 8 }),
    readiness90DayBest: present(77),
    bodyBattery90DayHigh: missing('No 90-day history recorded yet.'),
    hrv: missing('No wearable reading.'),
    restingHr: missing('No wearable reading.'),
    sleep: missing('No wearable reading.'),
    pmc: present({ fitness: 68, fatigue: 58, form: -2, series: [] }),
    recovery: present({ hoursRemaining: 26, clearAtLabel: 'Fri 09:00' }),
    bodyBattery: missing('No wearable reading since Tue.'),
    session: present({
      title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
      blocks: [{ label: 'Block 1', minutes: 12, watts: 285 }],
    }),
    ride: missing('No ride recorded yet today.'),
    zones: missing('No ride recorded yet today.'),
    peaks: missing('No peak-power breakdown for this ride yet.'),
    planVsRidden: missing('This ride was not matched to its plan.'),
    verdict: missing('The coach has not weighed in yet today.'),
    whatThisChanges: missing('The coach has not weighed in on this ride yet.'),
    conditions: missing('No location from a recent ride.'),
    tomorrow: present({ title: 'Recovery spin', detail: 'Easy.', unlockLabel: missing('No unlock time.') }),
    isLoading: false,
  } as TodayModel

  it('orders 01, Quote Plate, 02, 03, Tomorrow Plate for Trained', () => {
    const { container } = render(<MemoryRouter><TodayView model={trainedModel} /></MemoryRouter>)
    const marks = Array.from(
      container.querySelectorAll('[data-section], [data-quote-plate], [data-tomorrow-plate]'),
    ).map((el) => el.getAttribute('data-section') ?? (el.hasAttribute('data-quote-plate') ? 'quote' : 'tomorrow'))
    expect(marks).toEqual(['01', 'quote', '02', '03', 'tomorrow'])
  })
})

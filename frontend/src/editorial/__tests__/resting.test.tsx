import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LiveRing from '../components/LiveRing'
import { missing, present } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import TodayView from '../pages/TodayView'

afterEach(cleanup)

describe('LiveRing', () => {
  it('draws the arc to the now value', () => {
    const { container } = render(<LiveRing label="HRV" wake={present(64)} now={present(74)} hue="var(--st-resting)" />)
    expect(screen.getByText('74')).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('keeps the ring frame and dashes the numeral when there is no reading', () => {
    const { container } = render(
      <LiveRing label="HRV" wake={missing('r')} now={missing('No wearable reading since Tue.')} hue="var(--st-resting)" />,
    )
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('No wearable reading since Tue.')).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders the signed delta line when both wake and now are present', () => {
    render(<LiveRing label="HRV" wake={present(64)} now={present(74)} hue="var(--st-resting)" unit="ms" />)
    expect(screen.getByText('+10 ms')).toBeTruthy()
  })

  it('omits the delta line rather than inventing one when only wake is missing', () => {
    const { container } = render(<LiveRing label="SLEEP" wake={missing('no delta field')} now={present(485)} hue="var(--st-resting)" />)
    expect(container.querySelector('[data-live-ring]')?.textContent).not.toContain('no delta field')
  })
})

const restingModel: TodayModel = {
  state: 'resting',
  dateLabel: present('THU 23 JUL'),
  streakDays: present(13),
  readiness: present({ score: 88, deltaVsYesterday: 6 }),
  readiness90DayBest: present(91),
  bodyBattery90DayHigh: present(94),
  bodyBattery: present({ wake: 88, now: 91 }),
  hrv: present({ value: 74, unit: 'ms', delta: 10, band: { low: 52, high: 80, position: 'above' } }),
  restingHr: present({ value: 46, unit: 'bpm', delta: -4, band: { low: 44, high: 55, position: 'below' } }),
  recentRestingHr: present([{ date: '2026-07-22', bpm: 46 }]),
  sleep: present({ totalS: 29100, deepS: 5400, remS: 6600, lightS: 15900, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 42, form: 22, series: [] }),
  recovery: present({ hoursRemaining: 0, clearAtLabel: 'Fresh now' }),
  session: missing('Nothing planned for today.'),
  ride: missing('No ride recorded yet today.'),
  zones: missing('No ride recorded yet today.'),
  peaks: missing('No peak-power breakdown for this ride yet.'),
  planVsRidden: missing('This ride was not matched to its plan.'),
  verdict: present({ headline: 'Climbing back.', body: "You've climbed 3 points since waking. There's nothing left to do today but let it finish." }),
  whatThisChanges: missing('The coach has not weighed in on this ride yet.'),
  conditions: missing('No location from a recent ride.'),
  tomorrow: present({ title: 'VO2 max · 5 × 4 @ 330 W', detail: 'Five by four, at 330.', unlockLabel: present('05:00') }),
  week: [
    { letter: 'M', tss: present(64) }, { letter: 'T', tss: present(48) }, { letter: 'W', tss: present(12) },
    { letter: 'T', tss: missing('No ride logged.') }, { letter: 'F', tss: present(24) },
    { letter: 'S', tss: present(68) }, { letter: 'S', tss: present(44) },
  ],
  isLoading: false,
} as TodayModel

describe('Resting screen composition', () => {
  it('renders RIGHT NOW then TRAJECTORY, in that order, with no Insight Strip', () => {
    const { container } = render(<MemoryRouter><TodayView model={restingModel} /></MemoryRouter>)
    const section01 = container.querySelector('[data-section="01"]')
    const section02 = container.querySelector('[data-section="02"]')
    expect(section01).not.toBeNull()
    expect(section02).not.toBeNull()
    expect(section01!.querySelector('h2')?.textContent).toBe('JETZT GERADE')
    expect(section02!.querySelector('h2')?.textContent).toBe('VERLAUF')
    expect(container.querySelectorAll('[data-live-ring]')).toHaveLength(3)
    expect(container.querySelector('[data-insight-strip]')).toBeNull()
  })

  it('never renders section 03, ERHOLUNG, or ABSORPTION on a resting day', () => {
    render(<MemoryRouter><TodayView model={restingModel} /></MemoryRouter>)
    expect(screen.queryByText('ABSORPTION')).toBeNull()
    const container = document.querySelector('main')
    expect(container?.querySelector('[data-section="03"]')).toBeNull()
  })

  it('renders the tomorrow plate and band', () => {
    const { container } = render(<MemoryRouter><TodayView model={restingModel} /></MemoryRouter>)
    expect(container.querySelector('[data-tomorrow-plate]')).not.toBeNull()
    expect(container.querySelector('[data-tomorrow-band]')).not.toBeNull()
  })
})

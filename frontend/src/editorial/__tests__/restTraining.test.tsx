import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import RangeRow from '../components/RangeRow'
import TomorrowBand from '../components/TomorrowBand'
import WeekRail from '../components/WeekRail'
import { missing, present } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import TodayView from '../pages/TodayView'

afterEach(cleanup)

describe('Rest and Training pieces', () => {
  it('RangeRow places the marker inside its band', () => {
    const { container } = render(<RangeRow label="DEEP" value={present(4800)} unit="s"
      band={{ low: 3600, high: 6000, position: 'in' }} />)
    const marker = container.querySelector('[data-range-marker]') as HTMLElement
    expect(marker).not.toBeNull()
    expect(parseFloat(marker.style.left)).toBeCloseTo(50, 0)
  })

  it('RangeRow with no band still renders the row', () => {
    const { container } = render(<RangeRow label="DEEP" value={present(4800)} unit="s" band={null} />)
    expect(container.querySelector('[data-range-row]')).not.toBeNull()
    expect(container.querySelector('[data-range-marker]')).toBeNull()
  })

  it('WeekRail dashes a day with no load rather than drawing a zero bar', () => {
    const { container } = render(<WeekRail days={[
      { letter: 'M', tss: present(64) }, { letter: 'T', tss: missing('No ride.') },
    ]} />)
    expect(container.querySelectorAll('[data-week-day]')).toHaveLength(2)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('TomorrowBand says nothing is planned rather than disappearing', () => {
    render(<TomorrowBand session={missing('Nothing planned for tomorrow yet.')} />)
    expect(screen.getByText('Nothing planned for tomorrow yet.')).toBeTruthy()
  })
})

const baseModel: TodayModel = {
  state: 'rest',
  dateLabel: present('WED 22 JUL'),
  streakDays: present(13),
  readiness: present({ score: 88, deltaVsYesterday: 6 }),
  readiness90DayBest: present(91),
  bodyBattery90DayHigh: missing('No 90-day history recorded yet.'),
  hrv: present({ value: 68, unit: 'ms', delta: 6, band: { low: 52, high: 74, position: 'above' } }),
  restingHr: present({ value: 48, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'below' } }),
  recentRestingHr: present([{ date: '2026-07-22', bpm: 46 }]),
  sleep: present({ totalS: 27720, deepS: 4920, remS: 6480, lightS: 15120, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 52, form: 16, series: [] }),
  recovery: present({ hoursRemaining: 22, clearAtLabel: 'Thu 17:30' }),
  bodyBattery: missing('No wearable reading since Tue.'),
  session: missing('Nothing planned for today.'),
  ride: missing('No ride recorded yet today.'),
  zones: missing('No ride recorded yet today.'),
  peaks: missing('No peak-power breakdown for this ride yet.'),
  planVsRidden: missing('This ride was not matched to its plan.'),
  verdict: present({ headline: "Absorb, don't add.", body: "You're fresh — that's the point." }),
  whatThisChanges: missing('The coach has not weighed in on this ride yet.'),
  conditions: missing('No location from a recent ride.'),
  tomorrow: present({ title: 'Threshold · 4 × 8 @ 285 W', detail: '', unlockLabel: missing('No unlock time.') }),
  week: [
    { letter: 'M', tss: present(64) }, { letter: 'T', tss: present(48) }, { letter: 'W', tss: present(12) },
    { letter: 'T', tss: missing('No ride logged.') }, { letter: 'F', tss: present(24) },
    { letter: 'S', tss: present(68) }, { letter: 'S', tss: present(44) },
  ],
  isLoading: false,
} as TodayModel

describe('Rest screen composition', () => {
  it('renders RECOVERY then ABSORPTION then TRAJECTORY, each with its own frame intact', () => {
    const { container } = render(<MemoryRouter><TodayView model={baseModel} /></MemoryRouter>)
    const section01 = container.querySelector('[data-section="01"]')
    const section02 = container.querySelector('[data-section="02"]')
    const section03 = container.querySelector('[data-section="03"]')
    expect(section01).not.toBeNull()
    expect(section02).not.toBeNull()
    expect(section03).not.toBeNull()
    expect(section01!.querySelector('h2')?.textContent).toBe('ERHOLUNG')
    expect(section02!.querySelector('h2')?.textContent).toBe('ABSORPTION')
    expect(section03!.querySelector('h2')?.textContent).toBe('VERLAUF')
    expect(container.querySelectorAll('[data-range-row]')).toHaveLength(3)
    expect(container.querySelector('[data-week-rail]')).not.toBeNull()
    expect(container.querySelector('[data-tomorrow-band]')).not.toBeNull()
  })

  it('never renders section 02 THE SESSION on a rest day', () => {
    render(<MemoryRouter><TodayView model={baseModel} /></MemoryRouter>)
    expect(screen.queryByText('DIE EINHEIT')).toBeNull()
  })
})

describe('Training screen composition', () => {
  const trainingModel: TodayModel = {
    ...baseModel,
    state: 'training',
    session: present({
      title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
      blocks: [
        { label: 'Warm-up', minutes: 20, watts: 180 },
        { label: 'Interval 1', minutes: 8, watts: 285 },
        { label: 'Interval 2', minutes: 8, watts: 285 },
        { label: 'Cool-down', minutes: 15, watts: 120 },
      ],
    }),
    conditions: present({ tempC: 13, windKmh: 14 }),
  } as TodayModel

  it('orders RECOVERY then THE SESSION then TRAJECTORY, with the session-preview bars present', () => {
    const { container } = render(<MemoryRouter><TodayView model={trainingModel} /></MemoryRouter>)
    const sectionEls = Array.from(container.querySelectorAll('[data-section]'))
    const sections = sectionEls.map((s) => s.getAttribute('data-section'))
    expect(sections).toEqual(['01', '02', '03'])
    expect(sectionEls[0].querySelector('h2')?.textContent).toBe('ERHOLUNG')
    expect(sectionEls[1].querySelector('h2')?.textContent).toBe('DIE EINHEIT')
    expect(sectionEls[2].querySelector('h2')?.textContent).toBe('VERLAUF')
    expect(container.querySelectorAll('[data-bars]').length).toBeGreaterThan(0)
  })

  it('never renders ABSORPTION on a training day', () => {
    render(<MemoryRouter><TodayView model={trainingModel} /></MemoryRouter>)
    expect(screen.queryByText('ABSORPTION')).toBeNull()
  })
})

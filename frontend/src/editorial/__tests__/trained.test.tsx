import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Bars from '../components/Bars'
import DeltaRow from '../components/DeltaRow'
import PeakRows from '../components/PeakRows'
import PMCChart from '../components/PMCChart'
import ZoneRows from '../components/ZoneRows'
import { missing, present } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import TodayView from '../pages/TodayView'

afterEach(cleanup)

describe('Trained sections', () => {
  it('Bars renders one bar per block', () => {
    const { container } = render(<Bars blocks={[
      { label: '1', minutes: 4, watts: present(305) },
      { label: '2', minutes: 4, watts: present(298) },
    ]} />)
    expect(container.querySelectorAll('[data-block]')).toHaveLength(2)
  })

  it('Bars renders a dim placeholder bar when a block has no watts value', () => {
    const { container } = render(<Bars blocks={[
      { label: '1', minutes: 4, watts: missing('No target set.') },
    ]} />)
    expect(container.querySelectorAll('[data-block]')).toHaveLength(1)
  })

  it('DeltaRow signs the delta', () => {
    render(<DeltaRow blocks={[
      { label: '1', minutes: 4, delta: 1 },
      { label: '2', minutes: 4, delta: -2 },
    ]} />)
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getByText('−2')).toBeTruthy()
  })

  it('ZoneRows keeps the section and explains itself when zones are unset', () => {
    render(<ZoneRows zones={missing('No HR zones set.')} />)
    expect(screen.getByText('No HR zones set.')).toBeTruthy()
  })

  it('ZoneRows renders bpm bounds and time-in-zone for real zones', () => {
    render(<ZoneRows zones={present([
      { name: 'Z1', lowBpm: 0, highBpm: 124, seconds: 1320 },
      { name: 'Z5', lowBpm: 164, highBpm: Infinity, seconds: 240 },
    ])} />)
    expect(screen.getByText('< 124')).toBeTruthy()
    expect(screen.getByText('164 +')).toBeTruthy()
  })

  it('ZoneRows formats each zone as mm:ss but the TOTAL as h:mm', () => {
    render(<ZoneRows zones={present([
      { name: 'Z1', lowBpm: 0, highBpm: 124, seconds: 1320 },
      { name: 'Z2', lowBpm: 124, highBpm: 141, seconds: 1440 },
      { name: 'Z3', lowBpm: 142, highBpm: 152, seconds: 1080 },
      { name: 'Z4', lowBpm: 153, highBpm: 163, seconds: 2340 },
      { name: 'Z5', lowBpm: 164, highBpm: Infinity, seconds: 240 },
    ])} />)
    // 1320s in one zone reads as mm:ss ("22:00"), never h:mm.
    expect(screen.getByText('22:00')).toBeTruthy()
    // The 6420s (107 min) TOTAL reads as h:mm ("1:47 TOTAL"), never "107:00".
    expect(screen.getByText('1:47 TOTAL')).toBeTruthy()
    expect(screen.queryByText('107:00 TOTAL')).toBeNull()
  })

  it('PeakRows renders the Total hero and omits the season-best column rather than inventing it', () => {
    render(<PeakRows
      total={present({ watts: 288, unit: 'WATTS · 12 MIN', delta: 'NEW RECORD' })}
      peaks={present([{ duration: '5:00', watts: 342, percentOfSeasonBest: null }])}
    />)
    expect(screen.getByText('288')).toBeTruthy()
    expect(screen.getByText('WATTS · 12 MIN')).toBeTruthy()
    expect(screen.getByText('NEW RECORD')).toBeTruthy()
    expect(screen.getByText('342')).toBeTruthy()
    expect(screen.queryByText(/% of season best/i)).toBeNull()
  })

  it('PeakRows shows the season-best column when a row carries it', () => {
    render(<PeakRows
      total={missing('No headline peak identified for this ride yet.')}
      peaks={present([{ duration: '5:00', watts: 342, percentOfSeasonBest: 74 }])}
    />)
    expect(screen.getByText('74%')).toBeTruthy()
  })

  it('PeakRows renders an honest dash for the Total when it is missing', () => {
    render(<PeakRows
      total={missing('No headline peak identified for this ride yet.')}
      peaks={missing('No peak-power breakdown for this ride yet.')}
    />)
    const totals = screen.getAllByText('—')
    expect(totals.length).toBeGreaterThan(0)
  })

  it('PMCChart renders nothing but its frame and reason without history', () => {
    const { container } = render(<PMCChart series={missing('Not enough training history yet.')} days={42} />)
    expect(screen.getByText('Not enough training history yet.')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('PMCChart renders an SVG line chart when a real series is present', () => {
    const series = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-07-${i + 1}`, ctl: 60 + i, atl: 50 + i * 2, tsb: -2 - i,
    }))
    const { container } = render(<PMCChart series={present(series)} days={42} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('polyline')).toHaveLength(3)
  })
})

describe('01 The Session composition', () => {
  // Coordinator review round 3, defect 1: the pen (Fpt7K) orders the Deltas
  // row above the RIDDEN bars, before the Baseline — Planned comes after.
  // This pins that order in the actual rendered screen, not just inside
  // Bars' own isolated test, so a future change that quietly reverses it
  // (or moves the Deltas row back above Bars/Planned) fails a test instead
  // of shipping invisibly, exactly the gap the coordinator flagged.
  const model: TodayModel = {
    state: 'trained',
    dateLabel: present('WED 22 JUL'),
    streakDays: present(13),
    readiness: present({ score: 74, deltaVsYesterday: 8 }),
    hrv: missing('No wearable reading.'),
    restingHr: missing('No wearable reading.'),
    sleep: missing('No wearable reading.'),
    pmc: present({ fitness: 68, fatigue: 58, form: -2, series: [] }),
    recovery: present({ hoursRemaining: 26, clearAtLabel: 'Fri 09:00' }),
    session: present({
      title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
      blocks: [
        { label: 'Block 1', minutes: 12, watts: 285 },
        { label: 'Block 2', minutes: 12, watts: 283 },
      ],
    }),
    ride: missing('No ride recorded yet today.'),
    zones: missing('No ride recorded yet today.'),
    peaks: missing('No peak-power breakdown for this ride yet.'),
    planVsRidden: missing('This ride was not matched to its plan.'),
    verdict: missing('The coach has not weighed in yet today.'),
    whatThisChanges: missing('The coach has not weighed in on this ride yet.'),
    conditions: missing('No location from a recent ride.'),
    tomorrow: missing("Tomorrow's plan is not set yet."),
    isLoading: false,
  } as TodayModel

  it('orders the Deltas row above the honest-missing Ridden row, then the Baseline, then Planned', () => {
    const { container } = render(<MemoryRouter><TodayView model={model} /></MemoryRouter>)
    const section = container.querySelector('[data-section="01"]')
    expect(section).not.toBeNull()
    const marks = Array.from(
      section!.querySelectorAll('[data-deltas-row], [data-ridden-row], [data-baseline], [data-bars]'),
    ).map((el) => el.getAttributeNames().find((n) => n.startsWith('data-')))
    expect(marks).toEqual(['data-deltas-row', 'data-ridden-row', 'data-baseline', 'data-bars'])
  })
})

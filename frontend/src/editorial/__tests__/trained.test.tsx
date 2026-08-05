import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Bars from '../components/Bars'
import PeakRows from '../components/PeakRows'
import PMCChart from '../components/PMCChart'
import ZoneRows from '../components/ZoneRows'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('Trained sections', () => {
  it('Bars renders one bar per block and signs the delta', () => {
    const { container } = render(<Bars blocks={[
      { label: '1', minutes: 4, watts: present(305), delta: 1 },
      { label: '2', minutes: 4, watts: present(298), delta: -2 },
    ]} />)
    expect(container.querySelectorAll('[data-block]')).toHaveLength(2)
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getByText('−2')).toBeTruthy()
  })

  it('Bars renders a dim placeholder bar when a block has no watts value', () => {
    const { container } = render(<Bars blocks={[
      { label: '1', minutes: 4, watts: missing('No target set.'), delta: null },
    ]} />)
    expect(container.querySelectorAll('[data-block]')).toHaveLength(1)
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

  it('PeakRows omits the season-best column rather than inventing it', () => {
    render(<PeakRows peaks={present([{ duration: '5:00', watts: 342, percentOfSeasonBest: null }])} />)
    expect(screen.getByText('342')).toBeTruthy()
    expect(screen.queryByText(/% of season best/i)).toBeNull()
  })

  it('PeakRows shows the season-best column when a row carries it', () => {
    render(<PeakRows peaks={present([{ duration: '5:00', watts: 342, percentOfSeasonBest: 74 }])} />)
    expect(screen.getByText('74%')).toBeTruthy()
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

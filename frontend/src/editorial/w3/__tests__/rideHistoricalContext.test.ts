import {rideZoneDose} from '../rideHistoricalContext'
import { describe, expect, it } from 'vitest'
import type { ActivityRead, PMCEntry, PMCResponse } from '../../../api/dashboard'
import { rideCalendarDate, ridePmcWindow, rideYearActivities } from '../rideHistoricalContext'

const point = (date: string, ctl: number): PMCEntry => ({ date, ctl, atl: ctl + 2, tsb: -2, daily_tss: null })
const pmc = (entries: PMCEntry[]): PMCResponse => ({ entries, per_sport: { cycling: [], running: [], gym: [] } })
const ride = (id: number, started_at: string, sport = 'cycling') => ({ id, started_at, sport } as ActivityRead)

describe('ride historical context', () => {
  it('uses the ride date and exactly seven days before, never the latest model point', () => {
    const old = point('2026-08-05', 40)
    const selected = point('2026-08-12', 43)
    expect(ridePmcWindow(pmc([old, selected, point('2026-09-21', 80)]), '2026-08-12T12:00:00')).toEqual({ current: selected, previous: old })
  })

  it('leaves an older ride empty if its day is outside the loaded model window', () => {
    expect(ridePmcWindow(pmc([point('2026-09-21', 80)]), '2025-08-12T12:00:00')).toEqual({ current: null, previous: null })
  })

  it('does not mistake eight sparse observations for seven calendar days', () => {
    const selected = point('2026-08-12', 43)
    const entries = [1, 2, 3, 4, 6, 7, 8].map(day => point(`2026-08-${String(day).padStart(2, '0')}`, 40))
    expect(ridePmcWindow(pmc([...entries, selected]), '2026-08-12T12:00:00')).toEqual({ current: selected, previous: null })
  })

  it('restricts recorded year totals to cycling in the selected year and no later than this ride', () => {
    const first = ride(1, '2025-01-02T12:00:00')
    const selected = ride(2, '2025-08-12T12:00:00')
    const records = [ride(0, '2024-12-31T12:00:00'), first, selected, ride(3, '2025-08-12T15:00:00'), ride(4, '2026-01-02T12:00:00'), ride(5, '2025-07-01T12:00:00', 'running')]
    expect(rideYearActivities(records, selected.started_at)).toEqual([first, selected])
  })

  it('does not manufacture a current date when the ride date is unknown', () => {
    expect(rideCalendarDate('invalid')).toBeNull()
    expect(ridePmcWindow(pmc([point('2026-09-21', 80)]), null)).toEqual({ current: null, previous: null })
    expect(rideYearActivities([ride(1, '2026-09-21T12:00:00')], undefined)).toEqual([])
  })
})

it('does not inflate a fraction of one percent into a fraction of the ride',()=>{
 expect(rideZoneDose(.5,3600)).toEqual({percent:.5,minutes:.3})
 expect(rideZoneDose(50,3600)).toEqual({percent:50,minutes:30})
})

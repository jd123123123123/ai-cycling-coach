import { describe, it, expect } from 'vitest'
import { highlightRecords } from '../w3RiderRecords'
import type { RiderRecords } from '../../../api/records'

const rec = (key: string, value: number, title: string | null, at: string | null) => ({
  key, value, unit: '', activity_id: 1, title, at,
})

describe('w3RiderRecords · the four cards a profile is built on', () => {
  it('formats each record the way a rider says it', () => {
    const out = highlightRecords({
      longest_ride_km: rec('longest_ride_km', 212.4, 'Harzrunde', '2026-05-04T07:00:00Z'),
      highest_climb_m: rec('highest_climb_m', 2140, 'Brocken', '2026-06-18T07:00:00Z'),
      longest_time_s: rec('longest_time_s', 29_520, 'Havel-Schleife', '2026-07-02T07:00:00Z'),
      hardest_ride_tss: rec('hardest_ride_tss', 341.2, 'Intervalle', '2026-08-09T07:00:00Z'),
    } as unknown as RiderRecords)

    expect(out.map((r) => `${r.value} ${r.unit}`)).toEqual([
      '212,4 km', '2.140 hm', '8:12 Std.', '341 TSS',
    ])
    expect(out[0].label).toBe('LÄNGSTE FAHRT')
    expect(out[0].ride).toBe('Harzrunde')
    expect(out[0].when).toMatch(/4\.\s*Mai/)
  })

  it('drops a record the rider has not set instead of printing a zero', () => {
    const out = highlightRecords({
      longest_ride_km: rec('longest_ride_km', 84, 'Feierabendrunde', null),
      highest_climb_m: null,
      longest_time_s: null,
      hardest_ride_tss: null,
    } as unknown as RiderRecords)
    expect(out).toHaveLength(1)
    expect(out[0].when).toBeNull()
  })

  it('keeps one fixed order, whatever order the server sent', () => {
    const out = highlightRecords({
      hardest_ride_tss: rec('hardest_ride_tss', 300, null, null),
      longest_ride_km: rec('longest_ride_km', 100, null, null),
    } as unknown as RiderRecords)
    expect(out.map((r) => r.key)).toEqual(['longest_ride_km', 'hardest_ride_tss'])
  })

  it('ignores a record key it has no label for, rather than showing the raw key', () => {
    const out = highlightRecords({
      fastest_40k_s: rec('fastest_40k_s', 3600, null, null),
    } as unknown as RiderRecords)
    expect(out).toEqual([])
  })

  it('survives no answer at all', () => {
    expect(highlightRecords(undefined)).toEqual([])
    expect(highlightRecords({} as RiderRecords)).toEqual([])
  })

  it('treats an empty ride title as no ride, not as a blank caption', () => {
    const out = highlightRecords({
      longest_ride_km: rec('longest_ride_km', 100, '   ', null),
    } as unknown as RiderRecords)
    expect(out[0].ride).toBeNull()
  })
})

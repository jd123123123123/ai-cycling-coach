import { describe, it, expect } from 'vitest'
import { coverIssue, dayOfYear, bikeCredit, COVER_BIKES } from '../w3cover'
import { COVER_PLATES } from '../w3tokens'

describe('w3cover · the issue is the day', () => {
  it('numbers the issue by day of the year', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1)
    expect(dayOfYear(new Date(2026, 7, 25))).toBe(237)
  })

  it('gives the same cover twice on the same day', () => {
    const a = coverIssue(new Date(2026, 7, 25, 6, 5))
    const b = coverIssue(new Date(2026, 7, 25, 22, 40))
    expect(a).toEqual(b)
  })

  it('turns the cover over from one day to the next', () => {
    const a = coverIssue(new Date(2026, 7, 25))
    const b = coverIssue(new Date(2026, 7, 26))
    expect(b.plate.key).not.toBe(a.plate.key)
    expect(b.bike).not.toBe(a.bike)
  })

  it('reaches every plate and every bike across a run of days', () => {
    const plates = new Set<string>()
    const bikes = new Set<string>()
    for (let d = 1; d <= 40; d++) {
      const i = coverIssue(new Date(2026, 0, d))
      plates.add(i.plate.key)
      bikes.add(i.bike)
    }
    expect(plates.size).toBe(COVER_PLATES.length)
    expect(bikes.size).toBe(COVER_BIKES.length)
  })

  it('credits the bike that is actually pictured', () => {
    const i = coverIssue(new Date(2026, 7, 25))
    expect(i.credit).toBe(bikeCredit(i.bike.replace('/w3/bikes/', '').replace('.webp', '')))
    expect(i.credit).toMatch(/^[A-Z ]+$/)
  })

  it('points at a real render in public/w3/bikes', () => {
    for (let d = 1; d <= 10; d++) {
      expect(coverIssue(new Date(2026, 0, d)).bike).toMatch(/^\/w3\/bikes\/[a-z-]+\.webp$/)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { cutRides, feedHeadEyebrow, storiesFromRides } from '../w3feedCuts'
import type { CrewRide } from '../../../api/crewRides'

const ride = (over: Partial<CrewRide>): CrewRide => ({
  id: 1, user_id: 6, handle: 'luca', display_name: 'luca', title: 'Ride',
  started_at: new Date().toISOString(),
  distance_m: 30_000, elevation_gain_m: 200, duration_seconds: 3600,
  sport: 'cycling', tss: 60, avg_power_w: 200, avg_hr: 140, calories: 700,
  is_mine: false, reactions: { counts: {}, mine: [] }, comment_count: 0,
  description: null, photo_urls: [], elevation_profile: null, power_profile: null,
  route: null, ...over,
})

describe('the cuts', () => {
  const rides = [
    ride({ id: 1, is_mine: false }),
    ride({ id: 2, is_mine: true }),
    ride({ id: 3, is_mine: false }),
  ]

  it('ALLE is everything the endpoint returned', () => {
    expect(cutRides(rides, 'all').map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('CREW is everyone but you', () => {
    expect(cutRides(rides, 'crew').map((r) => r.id)).toEqual([1, 3])
  })

  it('MEINE is only yours', () => {
    expect(cutRides(rides, 'mine').map((r) => r.id)).toEqual([2])
  })
})

describe('who reaches the story rail', () => {
  const NOW = new Date('2026-09-02T18:00:00')
  const at = (iso: string, over: Partial<CrewRide> = {}) =>
    ride({ started_at: new Date(iso).toISOString(), ...over })

  it('is people who rode TODAY, not everyone in the feed', () => {
    const out = storiesFromRides(
      [at('2026-09-02T07:00:00', { id: 1, user_id: 1 }),
       at('2026-09-01T07:00:00', { id: 2, user_id: 2 })],
      NOW, (r) => r.id,
    )
    expect(out).toEqual([1])
  })

  it('COUNTS A RIDER ONCE, however many times they went out', () => {
    // A rail is a list of people, not of rides.
    const out = storiesFromRides(
      [at('2026-09-02T07:00:00', { id: 1, user_id: 9 }),
       at('2026-09-02T17:00:00', { id: 2, user_id: 9 })],
      NOW, (r) => r.id,
    )
    expect(out).toEqual([2])   // and it is their latest
  })

  it('puts the newest rider first', () => {
    const out = storiesFromRides(
      [at('2026-09-02T06:00:00', { id: 1, user_id: 1 }),
       at('2026-09-02T17:00:00', { id: 2, user_id: 2 })],
      NOW, (r) => r.id,
    )
    expect(out).toEqual([2, 1])
  })

  it('uses local midnight, not 24 hours ago', () => {
    // Yesterday at 19:00 is inside a 24h window and outside "today", and the
    // heading says today.
    const out = storiesFromRides([at('2026-09-01T19:00:00', { id: 1 })], NOW, (r) => r.id)
    expect(out).toEqual([])
  })

  it('drops a ride with an unparseable date rather than placing it', () => {
    const bad = ride({ id: 1, started_at: 'not-a-date' })
    expect(storiesFromRides([bad], NOW, (r) => r.id)).toEqual([])
  })
})

describe('the dated eyebrow', () => {
  it('names the day and the time the feed was built', () => {
    expect(feedHeadEyebrow(new Date('2026-09-02T18:24:00'))).toBe('MITTWOCH · 18:24')
  })

  it('pads a single-digit hour', () => {
    expect(feedHeadEyebrow(new Date('2026-09-02T07:05:00'))).toBe('MITTWOCH · 07:05')
  })
})

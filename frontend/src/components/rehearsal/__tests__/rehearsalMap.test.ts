import { describe, it, expect } from 'vitest'
import {
  blowUpIndices,
  polylineFromSegments,
  polylineIndices,
  powerColors,
} from '../rehearsalMap'
import type { RehearsalSegment } from '../../../api/rehearsal'

const seg = (o: Partial<RehearsalSegment> & { start_m: number }): RehearsalSegment => ({
  gradient_pct: 0,
  elevation_m: 1000,
  lat: 46.5,
  lng: 11.8,
  power_w: 200,
  speed_ms: 8,
  elapsed_s: 0,
  w_bal_j: 20000,
  climb_id: null,
  ...o,
})

describe('polylineFromSegments', () => {
  it('keeps the route in order', () => {
    const line = polylineFromSegments([
      seg({ start_m: 0, lat: 46.0, lng: 11.0 }),
      seg({ start_m: 150, lat: 46.1, lng: 11.1 }),
      seg({ start_m: 300, lat: 46.2, lng: 11.2 }),
    ])
    expect(line).toEqual([
      [46.0, 11.0],
      [46.1, 11.1],
      [46.2, 11.2],
    ])
  })

  it('drops segments with no coordinates instead of defaulting them', () => {
    // Rehearsals stored before the map shipped have null lat/lng. Defaulting
    // those to 0 would draw the route through the Atlantic.
    const line = polylineFromSegments([
      seg({ start_m: 0, lat: 46.0, lng: 11.0 }),
      seg({ start_m: 150, lat: null, lng: null }),
      seg({ start_m: 300, lat: 46.2, lng: 11.2 }),
    ])
    expect(line).toEqual([
      [46.0, 11.0],
      [46.2, 11.2],
    ])
  })

  it('drops Null Island, which GPX exporters emit for dropped fixes', () => {
    const line = polylineFromSegments([
      seg({ start_m: 0, lat: 0, lng: 0 }),
      seg({ start_m: 150, lat: 46.2, lng: 11.2 }),
    ])
    expect(line).toEqual([[46.2, 11.2]])
  })

  it('is empty when nothing has a position, so no map is drawn at all', () => {
    expect(polylineFromSegments([seg({ start_m: 0, lat: null, lng: null })])).toEqual([])
  })
})

describe('polylineIndices', () => {
  it('maps every drawn vertex back to its own segment', () => {
    const segs = [
      seg({ start_m: 0 }),
      seg({ start_m: 150, lat: null, lng: null }),
      seg({ start_m: 300 }),
    ]
    // The dropped segment must not shift the mapping: vertex 1 is segment 2.
    expect(polylineIndices(segs)).toEqual([0, 2])
    expect(polylineFromSegments(segs)).toHaveLength(2)
  })
})

describe('powerColors', () => {
  it('returns one colour per drawn vertex, so the ramp lines up with the track', () => {
    const segs = [
      seg({ start_m: 0, power_w: 150 }),
      seg({ start_m: 150, power_w: 250 }),
      seg({ start_m: 300, power_w: 350 }),
    ]
    expect(powerColors(segs)).toHaveLength(polylineFromSegments(segs).length)
  })

  it('paints the hardest stretch differently from the easiest', () => {
    const colors = powerColors([
      seg({ start_m: 0, power_w: 120 }),
      seg({ start_m: 150, power_w: 240 }),
      seg({ start_m: 300, power_w: 380 }),
    ])
    expect(colors[0]).not.toBe(colors[colors.length - 1])
  })

  it('gives up on a flat power plan rather than inventing a ramp', () => {
    expect(
      powerColors([
        seg({ start_m: 0, power_w: 200 }),
        seg({ start_m: 150, power_w: 200 }),
      ]),
    ).toEqual([])
  })

  it('gives up when nothing was predicted', () => {
    expect(
      powerColors([
        seg({ start_m: 0, power_w: null }),
        seg({ start_m: 150, power_w: null }),
      ]),
    ).toEqual([])
  })
})

describe('blowUpIndices', () => {
  it('lands on the segment nearest the recorded distance', () => {
    const segs = [
      seg({ start_m: 0 }),
      seg({ start_m: 150 }),
      seg({ start_m: 300 }),
      seg({ start_m: 450 }),
    ]
    expect(blowUpIndices(segs, [{ distance_m: 320 }])).toEqual([2])
    expect(blowUpIndices(segs, [{ distance_m: 440 }])).toEqual([3])
  })

  it('has nothing to mark on a ride that never blows up', () => {
    expect(blowUpIndices([seg({ start_m: 0 })], [])).toEqual([])
  })
})

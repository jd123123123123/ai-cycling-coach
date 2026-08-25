import { describe, it, expect } from 'vitest'
import { looksLikeRepeatSet } from '../rideRepeats'

describe('looksLikeRepeatSet · a set, not a ride with hills in it', () => {
  it('accepts four efforts of nearly the same length', () => {
    expect(looksLikeRepeatSet([300, 310, 295, 305])).toBe(true)
  })

  it('rejects a Sunday loop whose climbs are nothing alike', () => {
    // Two minutes, then eleven, then four: three climbs, one ride, no set.
    expect(looksLikeRepeatSet([120, 660, 240])).toBe(false)
  })

  it('rejects two of anything, however alike', () => {
    expect(looksLikeRepeatSet([300, 300])).toBe(false)
  })

  it('allows a set that drifted as the rider tired', () => {
    // The last one 20% longer than the first — still obviously the same hill.
    expect(looksLikeRepeatSet([300, 320, 340, 360])).toBe(true)
  })

  it('is false for no climbs at all', () => {
    expect(looksLikeRepeatSet([])).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { beamSteps } from '../W3Sections'

/**
 * The day beam is the only place on Today where a rider compares one week
 * against another, so its scale must be ABSOLUTE. The previous tick scaled
 * against the hardest day of the week on screen, which meant an easy week
 * redrew its easiest ride as tall as a race — the bug these tests exist to
 * keep out.
 */
describe('beamSteps', () => {
  it('lights nothing on a rest day', () => {
    expect(beamSteps(0)).toBe(0)
  })

  it('lights one step for anything actually ridden', () => {
    // A twenty-minute spin is not a rest day, and the strip must not say it was.
    expect(beamSteps(1)).toBe(1)
    expect(beamSteps(30)).toBe(1)
    // A recovery ride is ONE step. The cuts were briefly 45/90/135, which lit
    // two for a 45 TSS spin the same card labelled "Erholungsfahrt".
    expect(beamSteps(45)).toBe(1)
  })

  it('reads a session by its own load, not by the week around it', () => {
    expect(beamSteps(60)).toBe(2)    // an endurance hour
    expect(beamSteps(112)).toBe(3)   // 4 x 8 at threshold
    expect(beamSteps(200)).toBe(4)   // the long hard one
  })

  it('is identical for the same day in an easy week and a hard one', () => {
    // THE REGRESSION. There is no week context in the signature at all, which
    // is the structural guarantee — if this ever takes a max again, the same
    // ride starts drawing differently depending on its company.
    expect(beamSteps.length).toBe(1)
  })

  it('never exceeds four steps however hard the day was', () => {
    expect(beamSteps(1000)).toBe(4)
  })
})

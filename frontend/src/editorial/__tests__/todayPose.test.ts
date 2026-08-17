import { describe, it, expect } from 'vitest'
import { poseForDay, POSE_LABEL, HARD_IF, EASY_IF } from '../w3/w3Pose'
import { DAY_STATES } from '../state/dayState'

/**
 * Today's hero pose. This is not decoration: the pose IS the server's cache key
 * (`/garage/scene/today?pose`), so a wrong or unstable answer either bills a
 * fresh paid render or shows the rider a picture of a day they aren't having.
 */
describe('poseForDay', () => {
  it('puts the rider to sleep on the bike on a rest morning', () => {
    expect(poseForDay('rest', null)).toBe('rest')
  })

  it('separates a rest day already under way from a rest morning', () => {
    // Same rest, different joke — and, deliberately, a different cached image.
    expect(poseForDay('resting', null)).toBe('lazy')
  })

  it('reads the prescribed intensity on a training day', () => {
    expect(poseForDay('training', HARD_IF)).toBe('hard')
    expect(poseForDay('training', 0.75)).toBe('endurance')
    expect(poseForDay('training', EASY_IF - 0.01)).toBe('recovery')
  })

  it('claims no effort when the plan carries no intensity', () => {
    expect(poseForDay('training', null)).toBe('endurance')
  })

  it('celebrates only once the ride is actually in the legs', () => {
    expect(poseForDay('trained', 0.99)).toBe('trained')
    expect(poseForDay('evening', 0.99)).toBe('evening')
  })

  it('answers for every day-state the app can be in', () => {
    for (const state of DAY_STATES) {
      const pose = poseForDay(state, 0.8)
      expect(POSE_LABEL[pose]).toBeTruthy()
    }
  })

  it('is stable — the same day always asks for the same cached scene', () => {
    expect(poseForDay('training', 0.8)).toBe(poseForDay('training', 0.8))
  })
})

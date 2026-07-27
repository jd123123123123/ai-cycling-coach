import { describe, it, expect } from 'vitest'
import { roadMode, roadModeIndex, type RoadMode } from '../roadMode'

const opts = (hasProfile: boolean, hasRidden = false) => ({ hasProfile, hasRidden })

describe('roadMode', () => {
  it('draws the prescribed terrain when work is planned and a profile exists', () => {
    expect(roadMode('ready', opts(true))).toBe('prescribed')
    expect(roadMode('controlled', opts(true))).toBe('prescribed')
  })

  it('falls back to a bare horizon rather than inventing a workout', () => {
    expect(roadMode('ready', opts(false))).toBe('bare')
    expect(roadMode('controlled', opts(false))).toBe('bare')
    expect(roadMode('pending', opts(true))).toBe('bare')
  })

  it('shows the road NOT being ridden on a recommended rest day', () => {
    expect(roadMode('rest', opts(true))).toBe('flat-unlit')
    expect(roadMode('rest', opts(false))).toBe('flat-unlit')
  })

  it('shows a calm valley on planned rest', () => {
    expect(roadMode('planned-rest', opts(true))).toBe('flat-calm')
  })

  it('shows the road actually ridden after a session, else a done landscape', () => {
    expect(roadMode('post', opts(true, true))).toBe('ridden')
    expect(roadMode('post', opts(true, false))).toBe('flat-done')
  })
})

describe('roadModeIndex', () => {
  it('gives every mode a distinct, stable shader index', () => {
    const modes: RoadMode[] = ['prescribed', 'ridden', 'flat-calm', 'flat-done', 'flat-unlit', 'bare']
    expect(modes.map(roadModeIndex)).toEqual([0, 1, 2, 3, 4, 5])
  })
})

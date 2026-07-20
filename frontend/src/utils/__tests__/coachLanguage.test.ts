/**
 * coachLanguage.test.ts — pins simpleWorkoutName parsing (audit P1-7).
 *
 * The audit's reference transformation is load-bearing:
 *   'Hill VO2 — 6×3min @ 115% FTP'
 *     → DE 'Berg-Intervalle · 6×3 Min sehr hart'
 *     → EN 'Hill intervals · 6×3 min very hard'
 */
import { describe, it, expect } from 'vitest'
import { simpleWorkoutName, intensityAdjective } from '../coachLanguage'

describe('intensityAdjective — %FTP bands', () => {
  it('<75 is locker/easy', () => {
    expect(intensityAdjective(65, 'de')).toBe('locker')
    expect(intensityAdjective(74.9, 'en')).toBe('easy')
  })
  it('75–90 is zügig/steady', () => {
    expect(intensityAdjective(75, 'de')).toBe('zügig')
    expect(intensityAdjective(85, 'en')).toBe('steady')
  })
  it('90–105 is hart/hard', () => {
    expect(intensityAdjective(90, 'de')).toBe('hart')
    expect(intensityAdjective(100, 'en')).toBe('hard')
    expect(intensityAdjective(105, 'de')).toBe('hart')
  })
  it('>105 is sehr hart/very hard', () => {
    expect(intensityAdjective(115, 'de')).toBe('sehr hart')
    expect(intensityAdjective(106, 'en')).toBe('very hard')
  })
  it('defaults to en', () => {
    expect(intensityAdjective(50)).toBe('easy')
  })
})

describe('simpleWorkoutName — audit reference case', () => {
  const title = 'Hill VO2 — 6×3min @ 115% FTP'
  it('DE: Berg-Intervalle · 6×3 Min sehr hart', () => {
    expect(simpleWorkoutName(title, 'de')).toBe('Berg-Intervalle · 6×3 Min sehr hart')
  })
  it('EN: Hill intervals · 6×3 min very hard', () => {
    expect(simpleWorkoutName(title, 'en')).toBe('Hill intervals · 6×3 min very hard')
  })
})

describe('simpleWorkoutName — common template shapes', () => {
  it('parses single-block endurance rides', () => {
    expect(simpleWorkoutName('Z2 endurance 60min @ 65% FTP', 'de')).toBe('Lockere Fahrt · 60 Min locker')
    expect(simpleWorkoutName('Z2 endurance 60min @ 65% FTP', 'en')).toBe('Chill ride · 60 min easy')
  })

  it('parses sweet spot intervals', () => {
    expect(simpleWorkoutName('Sweet Spot 3×12min @ 90% FTP', 'de')).toBe('Fokussierter Aufwand · 3×12 Min hart')
    expect(simpleWorkoutName('Sweet Spot 3×12min @ 90% FTP', 'en')).toBe('Focused effort · 3×12 min hard')
  })

  it('parses threshold intervals with a lowercase x', () => {
    expect(simpleWorkoutName('Threshold 2x20min @ 100% FTP', 'en')).toBe('Hard intervals · 2×20 min hard')
    expect(simpleWorkoutName('Threshold 2x20min @ 100% FTP', 'de')).toBe('Harte Intervalle · 2×20 Min hart')
  })

  it('parses tempo blocks', () => {
    expect(simpleWorkoutName('Tempo 2×15min @ 85% FTP', 'en')).toBe('Steady push · 2×15 min steady')
  })

  it('handles structure without a recognised keyword', () => {
    expect(simpleWorkoutName('Custom 4×8min @ 108% FTP', 'de')).toBe('Intervalle · 4×8 Min sehr hart')
    expect(simpleWorkoutName('Custom 4×8min @ 108% FTP', 'en')).toBe('Intervals · 4×8 min very hard')
  })

  it('handles duration without %FTP (no adjective)', () => {
    expect(simpleWorkoutName('Progressive Z2 — 90min', 'de')).toBe('Lockere Fahrt · 90 Min')
  })

  it('recognises recovery spins', () => {
    expect(simpleWorkoutName('Recovery spin 40min @ 55% FTP', 'en')).toBe('Easy spin · 40 min easy')
  })

  it('parses second-based sprint repeats', () => {
    expect(simpleWorkoutName('Sprints 8×30sec @ 150% FTP', 'de')).toBe('Sprints · 8×30 Sek sehr hart')
  })

  it('falls back to the original title when nothing parses', () => {
    expect(simpleWorkoutName('Coffee shop loop', 'en')).toBe('Coffee shop loop')
    expect(simpleWorkoutName('', 'de')).toBe('')
  })

  it('keyword alone (no structure) still simplifies', () => {
    expect(simpleWorkoutName('VO2max session', 'de')).toBe('Harte Fahrt')
  })
})

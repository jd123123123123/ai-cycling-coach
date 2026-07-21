import { describe, expect, it } from 'vitest'
import { starterFtp } from '../trainingScience'

/**
 * Starter-FTP heuristic — the no-device/no-FTP onboarding path must always
 * produce a valid FTP (backend plan gate: ftp_watts ≥ 100) from weight + a
 * self-assessed fitness feel. Conservative W/kg priors:
 * new ≈ 2.0, returning ≈ 2.6, seasoned ≈ 3.0.
 */
describe('starterFtp', () => {
  it('estimates a conservative beginner FTP (~2.0 W/kg)', () => {
    expect(starterFtp(70, 'new')).toBe(140)
    expect(starterFtp(85, 'new')).toBe(170)
  })

  it('estimates a regular rider FTP (~2.6 W/kg)', () => {
    expect(starterFtp(70, 'returning')).toBe(182)
  })

  it('estimates a seasoned rider FTP (~3.0 W/kg)', () => {
    expect(starterFtp(70, 'seasoned')).toBe(210)
  })

  it('never returns below the 100 W plan gate', () => {
    // A very light beginner would compute below 100 W — clamp up so
    // POST /plan/build (gate ftp_watts >= 100) always succeeds.
    expect(starterFtp(45, 'new')).toBe(100)
    expect(starterFtp(30, 'new')).toBe(100)
  })

  it('clamps implausibly high results', () => {
    expect(starterFtp(200, 'seasoned')).toBe(350)
  })

  it('returns null without a usable weight', () => {
    expect(starterFtp(null, 'new')).toBeNull()
    expect(starterFtp(0, 'new')).toBeNull()
    expect(starterFtp(20, 'new')).toBeNull()
    expect(starterFtp(250, 'new')).toBeNull()
    expect(starterFtp(Number.NaN, 'new')).toBeNull()
  })
})

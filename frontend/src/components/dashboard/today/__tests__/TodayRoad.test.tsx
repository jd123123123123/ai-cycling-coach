import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import TodayRoad, { roadSvgPath } from '../TodayRoad'
import { buildRoadProfile } from '../../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../../api/coach'

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'B', duration_s: 300,
    target_watts_low: 300, target_watts_high: 300, target_pct_ftp: 120,
    zone: 5, rpe: 8, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}
const profile = buildRoadProfile([block()], { cp: 250, wPrime: 20000 })

afterEach(cleanup)

describe('roadSvgPath', () => {
  it('spans the full width and stays inside the box', () => {
    const d = roadSvgPath(profile, 390, 200)
    expect(d.startsWith('M0,')).toBe(true)
    const xs = [...d.matchAll(/[ML](\d+(?:\.\d+)?),/g)].map((m) => Number(m[1]))
    expect(Math.max(...xs)).toBeCloseTo(390, 0)
  })

  it('returns an empty path for an empty profile', () => {
    expect(roadSvgPath(buildRoadProfile([], { cp: 250, wPrime: 20000 }), 390, 200)).toBe('')
  })
})

describe('TodayRoad', () => {
  it('falls back to an SVG profile when WebGL is unavailable', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<TodayRoad profile={profile} mode="prescribed" auraColor="#16E08A" />)
    expect(screen.getByTestId('road-svg-fallback')).toBeTruthy()
    spy.mockRestore()
  })

  it('keeps the visual layer out of the accessibility tree', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<TodayRoad profile={profile} mode="prescribed" auraColor="#16E08A" />)
    expect(screen.getByTestId('road-svg-fallback').getAttribute('aria-hidden')).toBe('true')
    spy.mockRestore()
  })
})

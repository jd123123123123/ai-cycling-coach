import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import TodayRoad, { roadSvgPath, roadRemountKey } from '../TodayRoad'
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

  it('honest-data rule: draws no waterline in the SVG fallback when CP is unknown', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const noCp = buildRoadProfile([block()], { cp: null, wPrime: null })
    render(<TodayRoad profile={noCp} mode="prescribed" auraColor="#16E08A" />)
    const svg = screen.getByTestId('road-svg-fallback')
    expect(svg.querySelector('line')).toBeNull()
    spy.mockRestore()
  })

  it('scrub: maps pointer position to travel, clamped to [0, 1], coalesced per rAF frame', async () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const onTravel = vi.fn()
    render(<TodayRoad profile={profile} mode="prescribed" auraColor="#16E08A" onTravel={onTravel} />)
    const host = screen.getByTestId('road-svg-fallback').parentElement as HTMLElement
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 390, width: 390, top: 0, bottom: 200, height: 200, x: 0, y: 0, toJSON() {},
    } as DOMRect)

    // Midpoint.
    fireEvent.pointerDown(host, { clientX: 195, pointerId: 1, buttons: 1 })
    await new Promise((r) => requestAnimationFrame(r))
    expect(onTravel).toHaveBeenLastCalledWith(0.5)

    // Past the right edge clamps to 1.
    fireEvent.pointerMove(host, { clientX: 5000, pointerId: 1, buttons: 1 })
    await new Promise((r) => requestAnimationFrame(r))
    expect(onTravel).toHaveBeenLastCalledWith(1)

    // Past the left edge clamps to 0.
    fireEvent.pointerMove(host, { clientX: -5000, pointerId: 1, buttons: 1 })
    await new Promise((r) => requestAnimationFrame(r))
    expect(onTravel).toHaveBeenLastCalledWith(0)

    spy.mockRestore()
  })

  it('scrub: a zero-width host never publishes a travel value', async () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const onTravel = vi.fn()
    render(<TodayRoad profile={profile} mode="prescribed" auraColor="#16E08A" onTravel={onTravel} />)
    const host = screen.getByTestId('road-svg-fallback').parentElement as HTMLElement
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON() {},
    } as DOMRect)

    fireEvent.pointerDown(host, { clientX: 100, pointerId: 1, buttons: 1 })
    await new Promise((r) => requestAnimationFrame(r))
    expect(onTravel).not.toHaveBeenCalled()

    spy.mockRestore()
  })
})

describe('roadRemountKey', () => {
  it('changes when zone/block structure changes even at identical sample count, duration, CP and minWbal', () => {
    // Same total duration and constant 300W throughout both profiles, so the
    // W′ trajectory (and thus minWbal) is identical — only the declared zone
    // per half differs, split across two blocks instead of one.
    const flat = buildRoadProfile(
      [block({ duration_s: 300, zone: 5 })],
      { cp: 250, wPrime: 20000 },
    )
    const reclassified = buildRoadProfile(
      [
        block({ duration_s: 150, zone: 3 }),
        block({ duration_s: 150, zone: 6 }),
      ],
      { cp: 250, wPrime: 20000 },
    )

    expect(flat.samples.length).toBe(reclassified.samples.length)
    expect(flat.totalDurationS).toBe(reclassified.totalDurationS)
    expect(flat.cp).toBe(reclassified.cp)
    expect(flat.minWbal).toBeCloseTo(reclassified.minWbal as number, 6)

    const keyA = roadRemountKey(flat, flat.samples.length)
    const keyB = roadRemountKey(reclassified, reclassified.samples.length)
    expect(keyA).not.toBe(keyB)
  })
})

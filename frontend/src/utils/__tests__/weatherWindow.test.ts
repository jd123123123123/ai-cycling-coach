import { describe, expect, it } from 'vitest'
import { computeWeatherWindow } from '../../components/dashboard/WeatherNudge'
import type { WeatherHour } from '../../hooks/useTodayWeather'

const hour = (h: number, over: Partial<WeatherHour> = {}): WeatherHour => ({
  time: `2026-07-20T${String(h).padStart(2, '0')}:00`,
  temp_c: 19,
  precip_prob: 5,
  wind_kmh: 12,
  wind_dir_deg: 315,
  code: 2,
  ...over,
})

const DAY = Array.from({ length: 24 }, (_, h) => hour(h))
const at = (h: number) => new Date(`2026-07-20T${String(h).padStart(2, '0')}:30:00`)

describe('computeWeatherWindow', () => {
  it('finds the longest dry window and highlights its hours', () => {
    // Rain from 13:00 → good run is the morning block of the 6..13 strip.
    const hours = DAY.map((x) => {
      const hh = new Date(x.time).getHours()
      return hh >= 13 ? hour(hh, { precip_prob: 90, code: 61 }) : x
    })
    const win = computeWeatherWindow(hours, at(8))!
    expect(win.allDayWet).toBe(false)
    expect(win.windowStart).toBe(8)
    expect(win.windowEnd).toBe(12)
    expect(win.rainOnsetHour).toBe(13)
    expect(win.strip.filter((s) => s.good).map((s) => s.hour)).toEqual([8, 9, 10, 11, 12])
  })

  it('flags an all-wet day (no teal, wet copy path)', () => {
    const wet = DAY.map((x) => hour(new Date(x.time).getHours(), { precip_prob: 95, code: 63 }))
    const win = computeWeatherWindow(wet, at(9))!
    expect(win.allDayWet).toBe(true)
    expect(win.windowStart).toBeNull()
    expect(win.strip.every((s) => !s.good)).toBe(true)
  })

  it('returns null when the outdoor day is over', () => {
    expect(computeWeatherWindow(DAY, at(20))).toBeNull()
  })

  it('clamps the strip start so 8 columns always end by 20:00', () => {
    const win = computeWeatherWindow(DAY, at(16))!
    expect(win.strip[0].hour).toBe(13)
    expect(win.strip[win.strip.length - 1].hour).toBe(20)
  })

  it('single scattered good hours do not form a window (min 2h)', () => {
    // Alternating rain — never two consecutive dry hours.
    const alt = DAY.map((x) => {
      const hh = new Date(x.time).getHours()
      return hh % 2 === 0 ? hour(hh, { precip_prob: 90, code: 61 }) : x
    })
    const win = computeWeatherWindow(alt, at(8))!
    expect(win.allDayWet).toBe(true)
  })
})

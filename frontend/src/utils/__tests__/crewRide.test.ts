import { describe, it, expect } from 'vitest'
import {
  rideDifficulty, estimatedRideSeconds, fmtEstimate,
  summariseWeather, clothingAdvice, projectRoute, skyIcon, type WeatherHour,
} from '../crewRide'

const hour = (over: Partial<WeatherHour>): WeatherHour => ({
  time: '2026-07-26T06:00:00Z',
  temp_c: 15, wind_kmh: 8, wind_dir_deg: 315, precip_prob_pct: 0, weather_code: 0,
  ...over,
})

describe('rideDifficulty', () => {
  it('bands on ascent per kilometre, not total ascent', () => {
    // The design's own example: 65 km / 850 m = 13.1 m/km → MODERATE.
    const d = rideDifficulty(65_000, 850)!
    expect(d.level).toBe('moderate')
    expect(d.metresPerKm).toBeCloseTo(13.1, 1)
    expect(d.color).toBe('#FFB020')

    // The same 850 m packed into 20 km is a mountain day, not a rolling one.
    expect(rideDifficulty(20_000, 850)!.level).toBe('brutal')
  })

  it('calls a flat spin easy and a long flat ride moderate', () => {
    expect(rideDifficulty(40_000, 120)!.level).toBe('easy')
    expect(rideDifficulty(120_000, 300)!.level).toBe('moderate')
  })

  it('grades the hard band', () => {
    expect(rideDifficulty(50_000, 900)!.level).toBe('hard') // 18 m/km
  })

  it('treats a missing ascent as flat rather than refusing to answer', () => {
    expect(rideDifficulty(50_000, null)!.level).toBe('easy')
  })

  it('is null without a real distance — "easy" would be a fabrication', () => {
    expect(rideDifficulty(null, 500)).toBeNull()
    expect(rideDifficulty(0, 500)).toBeNull()
  })
})

describe('estimatedRideSeconds', () => {
  it('reproduces the design figure: 65 km / 850 m → 2h40', () => {
    const s = estimatedRideSeconds(65_000, 850)!
    expect(fmtEstimate(s)).toBe('2h39')
    // Within a minute of the design's rounded "2h40".
    expect(Math.abs(s - 160 * 60)).toBeLessThan(120)
  })

  it('slows down as the climbing density rises', () => {
    const flat = estimatedRideSeconds(60_000, 100)!
    const hilly = estimatedRideSeconds(60_000, 1500)!
    expect(hilly).toBeGreaterThan(flat)
  })

  it('is null without a distance', () => {
    expect(estimatedRideSeconds(null, 500)).toBeNull()
  })
})

describe('fmtEstimate', () => {
  it('formats hours and bare minutes', () => {
    expect(fmtEstimate(160 * 60)).toBe('2h40')
    expect(fmtEstimate(45 * 60)).toBe('45min')
    expect(fmtEstimate(60 * 60)).toBe('1h00')
    expect(fmtEstimate(null)).toBe('—')
  })
})

describe('summariseWeather', () => {
  it('calls the design example great: 11–18°, 0% rain, light wind', () => {
    const s = summariseWeather([
      hour({ temp_c: 11 }), hour({ temp_c: 12 }), hour({ temp_c: 14 }),
      hour({ temp_c: 16 }), hour({ temp_c: 18 }),
    ])!
    expect(s.verdict).toBe('great')
    expect(s.minTempC).toBe(11)
    expect(s.maxTempC).toBe(18)
  })

  it('rain outranks everything — it is the one thing that ruins a ride', () => {
    expect(summariseWeather([hour({ precip_prob_pct: 60 })])!.verdict).toBe('rough')
    expect(summariseWeather([hour({ precip_prob_pct: 30 })])!.verdict).toBe('ok')
  })

  it('flags real wind and real cold', () => {
    expect(summariseWeather([hour({ wind_kmh: 40 })])!.verdict).toBe('rough')
    expect(summariseWeather([hour({ wind_kmh: 28 })])!.verdict).toBe('ok')
    expect(summariseWeather([hour({ temp_c: 1 })])!.verdict).toBe('rough')
    expect(summariseWeather([hour({ temp_c: 6 })])!.verdict).toBe('ok')
    expect(summariseWeather([hour({ temp_c: 33 })])!.verdict).toBe('rough')
  })

  it('is null with no usable hours rather than a cheerful default', () => {
    expect(summariseWeather([])).toBeNull()
    expect(summariseWeather(null)).toBeNull()
    expect(summariseWeather([hour({ temp_c: null, wind_kmh: null, precip_prob_pct: null })])).toBeNull()
  })
})

describe('clothingAdvice', () => {
  it('keys on the START temperature, not the average', () => {
    // 11° → 18°: the mean says short sleeves, the roll-out says arm warmers.
    const s = summariseWeather([hour({ temp_c: 11 }), hour({ temp_c: 18 })])!
    expect(clothingAdvice(s, false)).toContain('Arm warmers and a gilet')
    expect(clothingAdvice(s, false)).toContain('warms to 18°')
    expect(clothingAdvice(s, true)).toContain('Armlinge und Weste')
  })

  it('dresses for the cold and the heat', () => {
    expect(clothingAdvice(summariseWeather([hour({ temp_c: 1 })])!, false)).toContain('Winter jacket')
    expect(clothingAdvice(summariseWeather([hour({ temp_c: 24 })])!, false)).toContain('Short sleeves and shorts')
  })

  it('adds a shell when rain is likely', () => {
    const s = summariseWeather([hour({ temp_c: 15, precip_prob_pct: 40 })])!
    expect(clothingAdvice(s, false)).toContain('rain shell')
  })

  it('only calls a start chilly when it IS chilly', () => {
    // Regression: a 23° start warming to 29° was described as "chilly 23°
    // start" because the wording hung off the warming delta alone.
    const hot = summariseWeather([hour({ temp_c: 23 }), hour({ temp_c: 29 })])!
    const warn = clothingAdvice(hot, false)!
    expect(warn).not.toContain('chilly')
    expect(warn).toContain('23° rising to 29°')
    // A genuinely cold start keeps the word.
    const cold = summariseWeather([hour({ temp_c: 9 }), hour({ temp_c: 17 })])!
    expect(clothingAdvice(cold, false)).toContain('chilly 9° start')
  })

  it('is null when there is no temperature to dress for', () => {
    expect(clothingAdvice(null, false)).toBeNull()
  })
})

describe('skyIcon', () => {
  it('maps the WMO bands a rider cares about', () => {
    expect(skyIcon(0)).toBe('clear')
    expect(skyIcon(2)).toBe('partly')
    expect(skyIcon(45)).toBe('fog')
    expect(skyIcon(61)).toBe('rain')
    expect(skyIcon(75)).toBe('snow')
    expect(skyIcon(86)).toBe('snow')
    expect(skyIcon(95)).toBe('storm')
  })

  it('falls back to clear rather than throwing on a missing code', () => {
    expect(skyIcon(null)).toBe('clear')
    expect(skyIcon(undefined)).toBe('clear')
  })
})

describe('projectRoute', () => {
  it('fits the track inside the box with north up', () => {
    const r = projectRoute([[48.0, 11.0], [48.1, 11.2], [48.05, 11.1]], 300, 200, 10)!
    expect(r.pts).toHaveLength(3)
    for (const [x, y] of r.pts) {
      expect(x).toBeGreaterThanOrEqual(9.9)
      expect(x).toBeLessThanOrEqual(290.1)
      expect(y).toBeGreaterThanOrEqual(9.9)
      expect(y).toBeLessThanOrEqual(190.1)
    }
    // North up: the highest latitude maps to the smallest y.
    expect(r.pts[1][1]).toBeLessThan(r.pts[0][1])
    expect(r.d.startsWith('M')).toBe(true)
  })

  it('is null for a track too short to draw', () => {
    expect(projectRoute([], 300, 200)).toBeNull()
    expect(projectRoute([[48, 11]], 300, 200)).toBeNull()
    expect(projectRoute(null, 300, 200)).toBeNull()
  })

  it('survives a degenerate track without dividing by zero', () => {
    const r = projectRoute([[48, 11], [48, 11]], 300, 200)!
    expect(Number.isFinite(r.pts[0][0])).toBe(true)
    expect(Number.isFinite(r.pts[0][1])).toBe(true)
  })
})

/**
 * crewRide — the derived facts a planned crew ride needs, as pure functions.
 *
 * The V3 · Ride Detail (Sunrise) design shows a difficulty pill, an estimated
 * duration, a weather verdict and a clothing line. None of those exist in the
 * crew-event model and none of them should: they are all functions of data the
 * event already carries (route distance + ascent) or of the forecast. Deriving
 * them keeps one producer per number and makes every one of them testable.
 *
 * Everything here returns null rather than a guess when its inputs are missing —
 * a crew event with no uploaded route has no distance, and "easy" would be a
 * fabrication.
 */

// ── Difficulty ───────────────────────────────────────────────────────────────

export type RideDifficulty = 'easy' | 'moderate' | 'hard' | 'brutal'

export interface DifficultyRead {
  level: RideDifficulty
  color: string
  /** Climbing density in metres of ascent per kilometre — the number the
   *  banding is actually built on, exposed so the UI can explain itself. */
  metresPerKm: number
}

/** Ascent per kilometre is what makes a ride hard, not total ascent: 850 m over
 *  65 km is a rolling day, the same 850 m over 20 km is a mountain. Distance
 *  still gets a say at the extremes, because a flat 180 km is not "easy". */
export function rideDifficulty(
  distanceM: number | null | undefined,
  elevationM: number | null | undefined,
): DifficultyRead | null {
  if (distanceM == null || !Number.isFinite(distanceM) || distanceM <= 0) return null
  const km = distanceM / 1000
  const asc = elevationM != null && Number.isFinite(elevationM) ? Math.max(0, elevationM) : 0
  const metresPerKm = asc / km
  const level: RideDifficulty =
    metresPerKm >= 25 ? 'brutal'
      : metresPerKm >= 15 ? 'hard'
        : metresPerKm >= 6 || km >= 100 ? 'moderate'
          : km >= 160 ? 'moderate'
            : 'easy'
  const color = level === 'easy' ? '#16E08A'
    : level === 'moderate' ? '#FFB020'
      : level === 'hard' ? '#FF7A3C'
        : '#FA1E55'
  return { level, color, metresPerKm: Math.round(metresPerKm * 10) / 10 }
}

// ── Estimated duration ───────────────────────────────────────────────────────

/** Group-ride moving speed by climbing density, km/h. Calibrated so the
 *  design's own example lands where the design says it does: 65 km with 850 m
 *  (13.1 m/km) → 24.5 km/h → 2 h 39, shown as "2h40".
 *
 *  This is a GROUP pace for a social ride, deliberately not a prediction of the
 *  viewing athlete's own speed — the whole crew rides it together, and an
 *  estimate that changed per viewer would be worse than useless for planning a
 *  meet time. */
const SPEED_BY_DENSITY: [maxMetresPerKm: number, kmh: number][] = [
  [5, 28],
  [10, 26],
  [15, 24.5],
  [20, 23],
  [Infinity, 21],
]

/** Estimated moving time in seconds, or null without a distance. */
export function estimatedRideSeconds(
  distanceM: number | null | undefined,
  elevationM: number | null | undefined,
): number | null {
  if (distanceM == null || !Number.isFinite(distanceM) || distanceM <= 0) return null
  const km = distanceM / 1000
  const asc = elevationM != null && Number.isFinite(elevationM) ? Math.max(0, elevationM) : 0
  const density = asc / km
  const kmh = SPEED_BY_DENSITY.find(([max]) => density < max)?.[1] ?? 21
  return Math.round((km / kmh) * 3600)
}

/** "2h40" / "45min" — the compact form the stat strip uses. */
export function fmtEstimate(seconds: number | null): string {
  if (seconds == null) return '—'
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

// ── Weather verdict + clothing ───────────────────────────────────────────────

export interface WeatherHour {
  time: string
  temp_c: number | null
  wind_kmh: number | null
  wind_dir_deg: number | null
  precip_prob_pct: number | null
  weather_code: number | null
}

export type WeatherVerdict = 'great' | 'ok' | 'rough'

export interface WeatherSummary {
  verdict: WeatherVerdict
  minTempC: number | null
  maxTempC: number | null
  maxWindKmh: number | null
  maxRainPct: number | null
}

/** Roll the ride window's hours into one verdict. Thresholds are the ones that
 *  actually change whether a rider enjoys a ride: rain probability first (the
 *  only one that can ruin it outright), then wind, then cold. */
export function summariseWeather(hourly: WeatherHour[] | null | undefined): WeatherSummary | null {
  const hours = (hourly ?? []).filter((h) => h.temp_c != null || h.wind_kmh != null || h.precip_prob_pct != null)
  if (hours.length === 0) return null
  const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x != null && Number.isFinite(x))
  const temps = nums(hours.map((h) => h.temp_c))
  const winds = nums(hours.map((h) => h.wind_kmh))
  const rains = nums(hours.map((h) => h.precip_prob_pct))
  const minTempC = temps.length ? Math.min(...temps) : null
  const maxTempC = temps.length ? Math.max(...temps) : null
  const maxWindKmh = winds.length ? Math.max(...winds) : null
  const maxRainPct = rains.length ? Math.max(...rains) : null

  const wet = maxRainPct != null && maxRainPct >= 50
  const showery = maxRainPct != null && maxRainPct >= 25
  const windy = maxWindKmh != null && maxWindKmh >= 35
  const breezy = maxWindKmh != null && maxWindKmh >= 25
  const freezing = minTempC != null && minTempC < 3
  const cold = minTempC != null && minTempC < 8
  const baking = maxTempC != null && maxTempC > 30

  const verdict: WeatherVerdict =
    wet || windy || freezing || baking ? 'rough'
      : showery || breezy || cold ? 'ok'
        : 'great'
  return { verdict, minTempC, maxTempC, maxWindKmh, maxRainPct }
}

/**
 * What to wear, from the window's own numbers. Keyed on the START temperature
 * rather than the average, because that is the decision the rider makes at the
 * door — a 6 a.m. roll-out at 11° warming to 18° needs arm warmers even though
 * the mean says short sleeves.
 */
export function clothingAdvice(s: WeatherSummary | null, de: boolean): string | null {
  if (!s || s.minTempC == null) return null
  const start = s.minTempC
  const end = s.maxTempC ?? start
  const warms = end - start >= 5
  const base = start < 3
    ? (de ? 'Winterjacke, lange Handschuhe und Überschuhe' : 'Winter jacket, full gloves and overshoes')
    : start < 8
      ? (de ? 'Lange Hose und Jacke' : 'Tights and a jacket')
      : start < 14
        ? (de ? 'Armlinge und Weste' : 'Arm warmers and a gilet')
        : start < 19
          ? (de ? 'Kurz, Armlinge für den Start' : 'Short sleeves, arm warmers for the start')
          : (de ? 'Kurz/kurz' : 'Short sleeves and shorts')
  // "chilly" only when it IS chilly. A 23° start that warms to 29° was being
  // described as a "chilly 23° start" because the wording hung off the warming
  // delta alone, with no reference to the actual temperature.
  const chillyStart = start < 15
  const tail = warms && chillyStart
    ? (de ? ` — kühler ${Math.round(start)}°-Start, am Ende ${Math.round(end)}°.`
          : ` — chilly ${Math.round(start)}° start, warms to ${Math.round(end)}° by the end.`)
    : warms
      ? (de ? ` — von ${Math.round(start)}° auf ${Math.round(end)}°.`
            : ` — ${Math.round(start)}° rising to ${Math.round(end)}°.`)
      : (de ? ` — durchgehend um ${Math.round(start)}°.` : ` — around ${Math.round(start)}° throughout.`)
  const rain = s.maxRainPct != null && s.maxRainPct >= 25
    ? (de ? ` Regenjacke einpacken (${Math.round(s.maxRainPct)}% Regenrisiko).`
          : ` Pack a rain shell (${Math.round(s.maxRainPct)}% chance of rain).`)
    : ''
  return base + tail + rain
}

// ── Route projection ─────────────────────────────────────────────────────────

/**
 * Project a lat/lng polyline into an SVG path fitted to a w×h box, north up and
 * aspect-preserved.
 *
 * This lived inline in RideAnalysisView and was deleted with that page's route
 * card; it belongs in utils because the crew-ride map hero needs exactly the
 * same projection and a second copy would drift from the first.
 */
export function projectRoute(
  poly: [number, number][] | null | undefined,
  w: number,
  h: number,
  pad = 12,
): { d: string; pts: [number, number][] } | null {
  if (!poly || poly.length < 2) return null
  const lats = poly.map((p) => p[0])
  const lngs = poly.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  // Scale longitude by cos(lat) so the shape isn't stretched east-west.
  const midLat = (minLat + maxLat) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)
  const gw = (maxLng - minLng) * kx || 1e-6
  const gh = (maxLat - minLat) || 1e-6
  const scale = Math.min((w - 2 * pad) / gw, (h - 2 * pad) / gh)
  const offX = pad + ((w - 2 * pad) - gw * scale) / 2
  const offY = pad + ((h - 2 * pad) - gh * scale) / 2
  const pts = poly.map(([lat, lng]): [number, number] => [
    offX + (lng - minLng) * kx * scale,
    offY + (maxLat - lat) * scale, // flip y → north up
  ])
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return { d, pts }
}

// ── Weather code → icon family ───────────────────────────────────────────────

/** WMO weather codes (what Open-Meteo returns) collapsed to the icon families
 *  the hourly strip needs. Every hour previously drew the same glyph, which made
 *  a sunny ride and a thunderstorm look identical. */
export type SkyIcon = 'clear' | 'partly' | 'fog' | 'rain' | 'storm' | 'snow'

export function skyIcon(code: number | null | undefined): SkyIcon {
  if (code == null || !Number.isFinite(code)) return 'clear'
  if (code >= 95) return 'storm'
  if (code >= 85) return 'snow'
  if (code >= 71 && code <= 79) return 'snow'
  if (code >= 51) return 'rain'
  if (code >= 45) return 'fog'
  if (code >= 1) return 'partly'
  return 'clear'
}

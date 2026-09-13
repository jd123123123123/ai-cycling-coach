import type { TodayWeather } from '../../hooks/useTodayWeather'
import type { W3Weather, W3WeatherHour } from './W3Sections'

/**
 * THE RIDE WINDOW — one implementation, two screens.
 *
 * This lived inside `W3TodayPage` as a private function. The morning briefing
 * answers the same question ("when should I go out today?") and would have had
 * to either import a page component or grow a second scorer — and two scorers
 * mean the popup can name 09:00-11:00 while the card behind it names
 * 14:00-16:00, from the same forecast, on the same morning. There is no way for
 * a rider to tell which one is wrong.
 *
 * So it moved here whole. Behaviour is unchanged; the only edit is the export.
 */

// ── Real weather → the "Where and when to ride it" card ─────────────────────
const WMO_DRY = new Set([0, 1, 2, 3, 45, 48])
/** A 0–1 ride-quality score per hour from real precip / wind / temp. */
function hourQuality(h: TodayWeather['hours'][number]): number {
  let q = 1
  if (h.precip_prob != null) q -= (h.precip_prob / 100) * 0.6
  if (h.wind_kmh != null) q -= Math.min(0.3, h.wind_kmh / 60)
  if (h.temp_c != null) { if (h.temp_c < 6 || h.temp_c > 30) q -= 0.35; else if (h.temp_c < 10 || h.temp_c > 26) q -= 0.15 }
  if (h.code != null && !WMO_DRY.has(h.code)) q -= 0.1
  return Math.max(0.06, Math.min(1, q))
}
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** An hour is only scoreable when it actually carries readings — otherwise
 *  hourQuality's "no penalties" would score an EMPTY hour a perfect 1.0. */
const hasReading = (h: TodayWeather['hours'][number]) => h.temp_c != null || h.precip_prob != null || h.wind_kmh != null
type QHour = W3WeatherHour & { q: number }
/** Build the real weather VM from /weather/today, or null when unavailable.
 *  TODAY ONLY — the endpoint has no multi-day forecast, and the card refuses to
 *  show these numbers under any other date.
 *  The whole day is passed through as `hours` (the card draws it as bars); the
 *  best window is picked from the rideable, scoreable ones only. */
export function buildWeather(tw: TodayWeather | undefined): W3Weather | null {
  if (!tw?.available || !tw.hours?.length) return null
  // Every hour the forecast returned, ascending — nulls preserved as nulls.
  // Keyed by the clock hour, so a DST day (25 rows, hour 02 twice) can't produce
  // two bars for the same o'clock. Daytime ride window: 07:00–21:00 local.
  const byHour = new Map<number, W3WeatherHour>()
  for (const h of tw.hours) {
    const hour = new Date(h.time).getHours()
    if (byHour.has(hour)) continue
    byHour.set(hour, {
      hour,
      q: hasReading(h) ? hourQuality(h) : null,
      temp: h.temp_c, rain: h.precip_prob, wind: h.wind_kmh,
      code: h.code, isDay: h.is_day,
      dir: h.wind_dir_deg != null ? DIRS[Math.round(h.wind_dir_deg / 45) % 8] : null,
      rideable: hour >= 7 && hour <= 21,
    })
  }
  const all: W3WeatherHour[] = [...byHour.values()].sort((x, y) => x.hour - y.hour)
  const hrs = all.filter((h): h is QHour => h.rideable && h.q != null)
  if (hrs.length < 2) return null
  // Best 2-hour window = highest average quality over two ADJACENT hours.
  let bestI = -1, bestAvg = -1
  for (let i = 0; i < hrs.length - 1; i++) {
    if (hrs[i + 1].hour !== hrs[i].hour + 1) continue
    const avg = (hrs[i].q + hrs[i + 1].q) / 2
    if (avg > bestAvg) { bestAvg = avg; bestI = i }
  }
  if (bestI < 0) hrs.forEach((h, i) => { if (h.q > bestAvg) { bestAvg = h.q; bestI = i } }) // no adjacent pair → best single hour
  const a = hrs[bestI]
  const b = hrs[bestI + 1]?.hour === a.hour + 1 ? hrs[bestI + 1] : null
  const pk = b && b.q > a.q ? b : a
  const to = b ? b.hour : a.hour
  const pad = (n: number) => `${String(n).padStart(2, '0')}:00`
  const dry = hrs.every((h) => (h.rain ?? 0) < 40)
  const wind = pk.wind != null ? `${Math.round(pk.wind)} km/h${pk.dir ? ` ${pk.dir}` : ''}` : 'windstill'
  return {
    window: `${pad(a.hour)}–${pad(to + 1)}`,
    temp: pk.temp != null ? `${Math.round(pk.temp)}°` : '—',
    feels: pk.temp != null ? `${Math.round(pk.temp - (pk.wind ?? 0) / 15)}°` : '—',
    // Real conditions in one line: wind at the peak hour + whether the day stays dry.
    short: `${wind} · ${dry ? 'trocken' : 'Schauer möglich'}`,
    // The verdict is EARNED by the best window's real ride quality, not a badge
    // that's always on.
    verdict: bestAvg >= 0.72 ? 'RAUS DAMIT' : bestAvg >= 0.45 ? 'MACHBAR' : 'BESSER DRINNEN',
    meta: 'Bestes 2-Stunden-Fenster aus Wind, Regen und Temperatur.',
    hours: all,
    bestFrom: a.hour, bestTo: to, peak: pk.hour,
  }
}

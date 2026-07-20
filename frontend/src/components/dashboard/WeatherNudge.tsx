/**
 * WeatherNudge — V3 "WeatherChip" (pencil-new.pen g9dRtP, Greeting Header on
 * V3 · Today): one always-visible, full-width pill under the greeting —
 * condition icon · temperature · wind · a color-toned verdict. Unlike the V2
 * card it renders on EVERY day (rest days included — the user's explicit
 * complaint was a hidden nudge); only missing data hides it (honest absence).
 *
 * The verdict compresses the ride-window math (computeWeatherWindow, kept +
 * tested) into three words; the full hourly WeatherWindow card lives on
 * Explore Routes per the V3 ownership map.
 */
import { useMemo } from 'react'
import { CloudRain, CloudSnow, CloudSun, Snowflake, Sun, Thermometer, Wind } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useTodayWeather, type WeatherHour } from '../../hooks/useTodayWeather'

// WMO code families (Open-Meteo): what disqualifies an hour outdoors.
const isWetCode = (c: number | null) => c != null && ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95)
const isSnowCode = (c: number | null) => c != null && ((c >= 71 && c <= 77) || c === 85 || c === 86)

export interface StripHour {
  hour: number
  temp: number | null
  wind: number | null
  windDir: number | null
  precip: number
  wet: boolean
  good: boolean
}

export interface WeatherWindow {
  strip: StripHour[]
  windowStart: number | null
  windowEnd: number | null
  windowTemp: number | null
  windMean: number | null
  windDirDeg: number | null
  rainOnsetHour: number | null
  allDayWet: boolean
  maxTemp: number | null
}

/** Pure strip/window computation — exported for tests and Routes reuse. */
export function computeWeatherWindow(hours: WeatherHour[], now: Date): WeatherWindow | null {
  const nowH = now.getHours()
  if (nowH >= 20) return null // outdoor day is over
  const startH = Math.min(Math.max(nowH, 6), 13) // 8 columns, ending ≤ 20:00
  const byHour = new Map<number, WeatherHour>()
  for (const h of hours) byHour.set(new Date(h.time).getHours(), h)

  const strip: StripHour[] = []
  for (let hh = startH; hh < startH + 8; hh++) {
    const src = byHour.get(hh)
    if (!src) continue
    const wet = (src.precip_prob ?? 0) >= 45 || isWetCode(src.code) || isSnowCode(src.code)
    const t = src.temp_c
    const good = !wet && (t == null || (t > -2 && t < 32)) && (src.wind_kmh == null || src.wind_kmh < 40)
    strip.push({
      hour: hh,
      temp: t,
      wind: src.wind_kmh,
      windDir: (src as { wind_dir_deg?: number | null }).wind_dir_deg ?? null,
      precip: src.precip_prob ?? 0,
      wet,
      good,
    })
  }
  if (strip.length < 4) return null

  // Longest contiguous good run (≥2h); ties → the earlier run.
  let best: { s: number; e: number } | null = null
  let runStart: number | null = null
  for (let i = 0; i <= strip.length; i++) {
    const good = i < strip.length && strip[i].good
    if (good && runStart === null) runStart = i
    if (!good && runStart !== null) {
      const len = i - runStart
      if (len >= 2 && (best === null || len > best.e - best.s + 1)) best = { s: runStart, e: i - 1 }
      runStart = null
    }
  }

  const inWindow = best ? strip.slice(best.s, best.e + 1) : strip
  const winds = inWindow.map((h) => h.wind).filter((w): w is number => w != null)
  const dirs = inWindow.map((h) => h.windDir).filter((d): d is number => d != null)
  const rainOnset = strip.find((h) => h.precip >= 45)?.hour ?? null
  const temps = strip.map((h) => h.temp).filter((t): t is number => t != null)

  return {
    strip: strip.map((h) => ({ ...h, good: best ? h.good && h.hour >= strip[best.s].hour && h.hour <= strip[best.e].hour : false })),
    windowStart: best ? strip[best.s].hour : null,
    windowEnd: best ? strip[best.e].hour : null,
    windowTemp: best ? (inWindow.find((h) => h.temp != null)?.temp ?? null) : (temps[0] ?? null),
    windMean: winds.length ? Math.round(winds.reduce((a, b) => a + b, 0) / winds.length) : null,
    windDirDeg: dirs.length ? dirs[0] : null,
    rainOnsetHour: rainOnset,
    allDayWet: best === null,
    maxTemp: temps.length ? Math.max(...temps) : null,
  }
}

/** V3 WeatherChip. `hidden` is accepted for mount compatibility but ignored —
 *  the chip shows on every day the forecast exists (rest days included). */
export default function WeatherNudge(_props: { hidden?: boolean }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useTodayWeather()

  const view = useMemo(() => {
    if (!data?.available || !data.hours.length) return null
    const now = new Date()
    const nowH = now.getHours()
    // Current-hour reading for the chip numbers (fall back to next hour).
    const cur = data.hours
      .map((h) => ({ h, hh: new Date(h.time).getHours() }))
      .find((x) => x.hh >= nowH)?.h ?? data.hours[data.hours.length - 1]
    const win = computeWeatherWindow(data.hours, now)
    return { cur, win }
  }, [data])

  if (!view) return null
  const { cur, win } = view

  const wetNow = (cur.precip_prob ?? 0) >= 45 || isWetCode(cur.code) || isSnowCode(cur.code)
  const temp = cur.temp_c
  const cold = temp != null && temp <= 2
  const hot = temp != null && temp >= 28

  const Icon = wetNow
    ? (cold ? CloudSnow : CloudRain)
    : hot ? Thermometer
    : cold ? Snowflake
    : temp != null && temp >= 18 ? Sun : CloudSun

  // Three-word verdict, V3 tone semantics: recovery green = good, amber =
  // caution-with-action, muted = neutral/info. Never alert-red for weather.
  const verdict = (() => {
    if (win?.allDayWet || (wetNow && !win?.windowStart)) {
      return { text: de ? 'Drinnen besser' : 'Better indoors', color: 'var(--color-ink-2)' }
    }
    if (wetNow && win?.windowStart != null) {
      return {
        text: de ? `Trocken ab ${win.windowStart} Uhr` : `Dry from ${win.windowStart}h`,
        color: 'var(--color-amber)',
      }
    }
    if (hot) return { text: de ? 'Heiß — früh raus' : 'Hot — go early', color: 'var(--color-amber)' }
    if (win?.rainOnsetHour != null) {
      return {
        text: de ? `Regen ab ${win.rainOnsetHour} Uhr` : `Rain after ${win.rainOnsetHour}h`,
        color: 'var(--color-amber)',
      }
    }
    return { text: de ? 'Gute Bedingungen' : 'Good conditions', color: 'var(--color-forest)' }
  })()

  const dot = <span className="rounded-full shrink-0" style={{ width: 3, height: 3, background: 'var(--color-muted)' }} />

  return (
    <div
      className="flex items-center rounded-full w-full"
      style={{ gap: 10, padding: '8px 14px', background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      data-testid="weather-nudge"
    >
      <Icon size={18} strokeWidth={2.2} style={{ color: 'var(--color-amber)', flexShrink: 0 }} />
      {temp != null && (
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{Math.round(temp)}°C</span>
      )}
      {cur.wind_kmh != null && (
        <>
          {dot}
          <Wind size={16} strokeWidth={2.2} style={{ color: 'var(--color-ink-2)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{Math.round(cur.wind_kmh)} km/h</span>
        </>
      )}
      {dot}
      <span style={{ fontSize: 13, fontWeight: 600, color: verdict.color }}>{verdict.text}</span>
    </div>
  )
}

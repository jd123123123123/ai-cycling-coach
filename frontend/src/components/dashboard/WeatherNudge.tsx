/**
 * WeatherNudge — the pen's "Weather window" card (pencil-new.pen IgqyH on
 * V2 · Explore Routes K3PVt), 1:1: teal icon-bubble + title/sub, temp chip,
 * an 8-hour ride-window strip (good hours glow in --color-stand), and a
 * wind/rain note row. Data: today's hourly forecast at the last ride's
 * location (athlete-local). Honest absence: renders nothing on rest days,
 * without a forecast, or when the outdoor day is effectively over.
 */
import { useMemo } from 'react'
import { CloudRain, CloudSnow, CloudSun, Snowflake, Sun, Thermometer, Wind } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useTodayWeather, type WeatherHour } from '../../hooks/useTodayWeather'

const cardStyle = {
  background: 'var(--color-paper-2)',
  border: '1px solid var(--color-rule)',
  borderRadius: 24,
} as const
const DISPLAY_FONT = 'var(--font-serif)' // Sora — pen num-display face

// WMO code families (Open-Meteo): what disqualifies an hour outdoors.
const isWetCode = (c: number | null) => c != null && ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95)
const isSnowCode = (c: number | null) => c != null && ((c >= 71 && c <= 77) || c === 85 || c === 86)

const COMPASS_DE = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'] as const
const COMPASS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const compass = (deg: number, de: boolean) =>
  (de ? COMPASS_DE : COMPASS_EN)[Math.round(((deg % 360) + 360) % 360 / 45) % 8]

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
  /** First/last good hour of the best contiguous run (inclusive), or null. */
  windowStart: number | null
  windowEnd: number | null
  windowTemp: number | null
  windMean: number | null
  windDirDeg: number | null
  rainOnsetHour: number | null
  allDayWet: boolean
  maxTemp: number | null
}

/** Pure strip/window computation — exported for tests. */
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

const fmtHourRange = (s: number, e: number, de: boolean) => {
  if (de) return `${s}–${e} Uhr`
  const ap = (h: number) => (h < 12 ? 'AM' : 'PM')
  const tw = (h: number) => (h % 12 === 0 ? 12 : h % 12)
  return ap(s) === ap(e) ? `${tw(s)}–${tw(e)} ${ap(e)}` : `${tw(s)} ${ap(s)}–${tw(e)} ${ap(e)}`
}

export default function WeatherNudge({ hidden = false }: { hidden?: boolean }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useTodayWeather()

  const win = useMemo(
    () => (data?.available && data.hours.length ? computeWeatherWindow(data.hours, new Date()) : null),
    [data],
  )

  if (hidden || !win) return null

  const hot = win.windowTemp != null && win.windowTemp >= 28
  const cold = win.windowTemp != null && win.windowTemp <= 2
  const HeadIcon = win.allDayWet
    ? (win.maxTemp != null && win.maxTemp <= 2 ? CloudSnow : CloudRain)
    : hot ? Thermometer
    : cold ? Snowflake
    : win.windowTemp != null && win.windowTemp >= 18 ? Sun : CloudSun

  const sub = win.allDayWet
    ? (de ? 'Draußen nass heute — Indoor ist völlig okay.' : 'Wet outside today — indoors is just fine.')
    : (() => {
        const range = fmtHourRange(win.windowStart!, win.windowEnd!, de)
        if (hot) return de ? `Beste Zeit: ${range} — danach wird's heiß` : `Best time to ride: ${range} — heat builds later`
        if (cold) return de ? `Beste Zeit: ${range} — warm anziehen` : `Best time to ride: ${range} — layer up`
        return de ? `Beste Zeit zum Fahren: ${range}` : `Best time to ride: ${range}`
      })()

  const noteBits: string[] = []
  if (win.windMean != null) {
    const dir = win.windDirDeg != null ? ` ${compass(win.windDirDeg, de)}` : ''
    noteBits.push(`${win.windMean} km/h${dir}`)
  }
  if (win.rainOnsetHour != null && !win.allDayWet) {
    noteBits.push(de ? `Regenrisiko steigt ab ${win.rainOnsetHour} Uhr` : `rain risk rises after ${win.rainOnsetHour % 12 === 0 ? 12 : win.rainOnsetHour % 12} ${win.rainOnsetHour < 12 ? 'AM' : 'PM'}`)
  } else if (!win.allDayWet) {
    noteBits.push(de ? 'kein Regen in Sicht' : 'no rain in sight')
  } else if (win.maxTemp != null) {
    noteBits.push(de ? `bis ${Math.round(win.maxTemp)}° heute` : `up to ${Math.round(win.maxTemp)}° today`)
  }
  const note = noteBits.join(' — ')

  const chipTemp = win.windowTemp ?? win.maxTemp

  return (
    <div className="p-5 flex flex-col gap-3.5" style={cardStyle} data-testid="weather-nudge">
      {/* Head: icon bubble + titles · temp chip (pen jt54q) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="grid place-items-center rounded-full shrink-0"
            style={{ width: 36, height: 36, background: 'color-mix(in srgb, var(--color-stand) 15%, transparent)' }}
          >
            <HeadIcon size={20} strokeWidth={2.2} style={{ color: 'var(--color-stand)' }} />
          </div>
          <div className="flex flex-col" style={{ gap: 1 }}>
            <span style={{ fontFamily: DISPLAY_FONT, fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
              {de ? 'Wetterfenster' : 'Weather window'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{sub}</span>
          </div>
        </div>
        {chipTemp != null && (
          <span
            className="inline-flex items-center rounded-full shrink-0"
            style={{ height: 28, padding: '0 10px', background: 'var(--color-surface-2)' }}
          >
            <span style={{ fontFamily: DISPLAY_FONT, fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
              {Math.round(chipTemp)}°
            </span>
          </span>
        )}
      </div>

      {/* Hour strip (pen lrDgJ): good hours glow teal */}
      <div className="flex" style={{ gap: 6 }}>
        {win.strip.map((h) => (
          <div key={h.hour} className="flex flex-col items-center flex-1" style={{ gap: 5 }}>
            <div
              className="w-full"
              style={{
                height: 26,
                borderRadius: 6,
                background: h.good ? 'var(--color-stand)' : 'var(--color-surface-3)',
                boxShadow: h.good ? '0 0 12px -2px color-mix(in srgb, var(--color-stand) 60%, transparent)' : undefined,
              }}
            />
            <span style={{ fontSize: 10, fontWeight: 600, color: h.good ? 'var(--color-ink)' : 'var(--color-muted)' }}>
              {h.hour}
            </span>
          </div>
        ))}
      </div>

      {/* Wind / rain note (pen ezscV) */}
      {note && (
        <div className="flex items-center" style={{ gap: 8 }}>
          <Wind size={16} strokeWidth={2.2} style={{ color: 'var(--color-stand)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.4 }}>{note}</span>
        </div>
      )}
    </div>
  )
}

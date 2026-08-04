/**
 * WeatherWindowCard — the hourly "Weather window" card from pencil-new.pen
 * "V3 · Explore Routes" (IgqyH): teal-tinted icon + "Wetterfenster" title with
 * the best-ride-window subline, a TempChip, the 8-column hour strip (teal =
 * inside the best contiguous dry window), and a wind/rain note row.
 *
 * Mounted on Today (explicit user decision, Jul 2026 — supersedes the V3
 * challenge-doc "Routes only" verdict) near the session card. Honest data
 * only: renders nothing without a real forecast (same computeWeatherWindow
 * math the WeatherChip verdict compresses; hides after 20:00 / thin data).
 */
import { useMemo } from 'react'
import { CloudRain, CloudSun, Wind } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useTodayWeather } from '../../hooks/useTodayWeather'
import { computeWeatherWindow, type WeatherWindow } from './WeatherNudge'
import { glassCardStyle, GLASS_CARD_MARKER } from './glassCard'
import { WindPanel } from './today/WindWidget'

const TEAL = 'var(--color-stand)'

/** Compass label from degrees (wind FROM direction). */
export function compassLabel(deg: number | null): string | null {
  if (deg == null || !Number.isFinite(deg)) return null
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

/**
 * The note line — rain only.
 *
 * Wind used to be the first fragment here ("12 km/h SW — rain risk rises after
 * 15:00"). It has moved to WindPanel, which draws it: the card would otherwise
 * state the same wind speed twice, once as a picture and once as text.
 * `includeWind` is kept for callers that render the note WITHOUT the dial
 * (WeatherNudge), where the text fragment is still the only wind they get.
 */
export function windowNote(win: WeatherWindow, de: boolean, includeWind = false): string | null {
  const parts: string[] = []
  if (includeWind && win.windMean != null) {
    const dir = compassLabel(win.windDirDeg)
    parts.push(`${win.windMean} km/h${dir ? ` ${dir}` : ''}`)
  }
  if (win.allDayWet) {
    parts.push(de ? 'heute bleibt es nass — Indoor ist die ehrliche Option' : 'staying wet today — indoors is the honest call')
  } else if (win.rainOnsetHour != null) {
    parts.push(de ? `Regenrisiko steigt ab ${win.rainOnsetHour} Uhr` : `rain risk rises after ${win.rainOnsetHour}:00`)
  }
  if (parts.length === 0) return null
  return parts.join(' — ')
}

export default function WeatherWindowCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useTodayWeather()

  const win = useMemo(() => {
    if (!data?.available || !data.hours.length) return null
    return computeWeatherWindow(data.hours, new Date())
  }, [data])

  // Honest absence: no forecast / outdoor day over → no card, never fabricated hours.
  if (!win || win.strip.length < 4) return null

  const sub = win.windowStart != null && win.windowEnd != null
    ? (de
      ? `Beste Fahrzeit: ${win.windowStart}–${win.windowEnd + 1} Uhr`
      : `Best time to ride: ${win.windowStart}–${win.windowEnd + 1}h`)
    : (de ? 'Kein trockenes Fenster heute' : 'No dry window today')
  const note = windowNote(win, de)
  const Icon = win.allDayWet ? CloudRain : CloudSun

  return (
    <div
      className="rounded-[24px] p-5 flex flex-col gap-3.5"
      style={glassCardStyle}
      {...GLASS_CARD_MARKER}
    >
      {/* Head — icon pill + titles | temp chip (pen jt54q) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 36, height: 36, background: `color-mix(in srgb, ${TEAL} 15%, transparent)` }}>
            <Icon size={19} strokeWidth={2.2} style={{ color: TEAL }} />
          </div>
          <div className="flex flex-col min-w-0" style={{ gap: 1 }}>
            <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Wetterfenster' : 'Weather window'}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{sub}</span>
          </div>
        </div>
        {win.windowTemp != null && (
          <span className="shrink-0 inline-flex items-center rounded-full px-2.5" style={{ height: 28, background: 'var(--color-surface-2)' }}>
            <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{Math.round(win.windowTemp)}°</span>
          </span>
        )}
      </div>

      {/* Hour strip — 8 columns; teal blocks = inside the best window (pen lrDgJ) */}
      <div className="flex gap-1.5">
        {win.strip.map((h) => (
          <div key={h.hour} className="flex-1 flex flex-col items-center" style={{ gap: 5 }}>
            <div
              className="w-full"
              style={{
                height: 26,
                borderRadius: 6,
                background: h.good ? TEAL : 'var(--color-surface-3)',
              }}
            />
            <span style={{ fontSize: 10, fontWeight: 600, color: h.good ? 'var(--color-ink)' : 'var(--color-muted)' }}>{h.hour}</span>
          </div>
        ))}
      </div>

      {/* Wind, drawn rather than described. Inside the weather card because it
          IS weather — it was a separate card sitting directly beneath this one,
          which split one answer ("what is it doing out there?") across two. */}
      <WindPanel />

      {/* Rain note row — real signals only (pen ezscV) */}
      {note && (
        <div className="flex items-center gap-2">
          <Wind size={15} strokeWidth={2.2} style={{ color: TEAL, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{note}</span>
        </div>
      )}
    </div>
  )
}

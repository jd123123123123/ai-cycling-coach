/**
 * WeatherNudge — one quiet line on Today: when (and whether) to take the
 * session outside. Composes today's hourly forecast (athlete-local, from the
 * last ride's location) into a single no-guilt sentence: a best outdoor
 * window on ridable days, "indoors is fine" on wet ones. Renders NOTHING on
 * rest days, when no forecast exists, or when the day is effectively over —
 * honest absence over broken chrome (audit weather rule).
 */
import { useMemo } from 'react'
import { CloudRain, CloudSnow, CloudSun, Snowflake, Sun, Thermometer } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useTodayWeather, type WeatherHour } from '../../hooks/useTodayWeather'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

// WMO code families (Open-Meteo): what makes an hour a bad idea outdoors.
const isWetCode = (c: number | null) => c != null && ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95)
const isSnowCode = (c: number | null) => c != null && ((c >= 71 && c <= 77) || c === 85 || c === 86)

interface Verdict {
  kind: 'window' | 'wet' | 'hot' | 'cold'
  startH: number
  endH: number
  temp: number | null
  maxTemp: number | null
}

function assess(hours: WeatherHour[], now: Date): Verdict | null {
  // Daylight-ish, still-ahead hours only. Needs a real 2h window to say anything.
  const nowH = now.getHours()
  const usable = hours.filter((h) => {
    const hh = new Date(h.time).getHours()
    return hh >= Math.max(7, nowH) && hh <= 21
  })
  if (usable.length < 2) return null

  const wetHour = (h: WeatherHour) => (h.precip_prob ?? 0) >= 45 || isWetCode(h.code) || isSnowCode(h.code)
  const score = (h: WeatherHour) => {
    const t = h.temp_c ?? 15
    const tempPenalty = t < 8 ? (8 - t) * 1.2 : t > 24 ? (t - 24) * 1.5 : 0
    const windPenalty = Math.max(0, (h.wind_kmh ?? 0) - 25) * 0.8
    return (h.precip_prob ?? 0) * 1.5 + tempPenalty + windPenalty
  }

  // Best contiguous rain-free 2h window by mean score.
  let best: { i: number; s: number } | null = null
  for (let i = 0; i + 1 < usable.length; i++) {
    const a = usable[i]
    const b = usable[i + 1]
    if (wetHour(a) || wetHour(b)) continue
    const s = (score(a) + score(b)) / 2
    if (best === null || s < best.s) best = { i, s }
  }
  const maxTemp = usable.reduce<number | null>((m, h) => (h.temp_c != null && (m === null || h.temp_c > m) ? h.temp_c : m), null)
  if (best === null) return { kind: 'wet', startH: 0, endH: 0, temp: null, maxTemp }

  const start = new Date(usable[best.i].time).getHours()
  const temp = usable[best.i].temp_c
  const kind: Verdict['kind'] = temp != null && temp >= 28 ? 'hot' : temp != null && temp <= 2 ? 'cold' : 'window'
  return { kind, startH: start, endH: start + 2, temp, maxTemp }
}

export default function WeatherNudge({ hidden = false }: { hidden?: boolean }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useTodayWeather()

  const verdict = useMemo(
    () => (data?.available && data.hours.length ? assess(data.hours, new Date()) : null),
    [data],
  )

  if (hidden || !verdict) return null

  const windowLabel = de
    ? `${verdict.startH}–${verdict.endH} Uhr`
    : `${verdict.startH}–${verdict.endH} h`
  const tempLabel = verdict.temp != null ? `${Math.round(verdict.temp)}°` : null

  const { Icon, text } = (() => {
    switch (verdict.kind) {
      case 'wet':
        return {
          Icon: verdict.maxTemp != null && verdict.maxTemp <= 2 ? CloudSnow : CloudRain,
          text: de
            ? 'Draußen nass heute — Indoor ist völlig okay.'
            : 'Wet outside today — indoors is just fine.',
        }
      case 'hot':
        return {
          Icon: Thermometer,
          text: de
            ? `Heiß heute (bis ${Math.round(verdict.maxTemp ?? verdict.temp ?? 0)}°) — bestes Fenster ${windowLabel}, viel trinken.`
            : `Hot today (up to ${Math.round(verdict.maxTemp ?? verdict.temp ?? 0)}°) — best window ${windowLabel}, drink plenty.`,
        }
      case 'cold':
        return {
          Icon: Snowflake,
          text: de
            ? `Kalt draußen — bestes Fenster ${windowLabel}${tempLabel ? ` · ${tempLabel}` : ''}, warm anziehen.`
            : `Cold out — best window ${windowLabel}${tempLabel ? ` · ${tempLabel}` : ''}, layer up.`,
        }
      default:
        return {
          Icon: verdict.temp != null && verdict.temp >= 18 ? Sun : CloudSun,
          text: de
            ? `Bestes Fenster draußen: ${windowLabel}${tempLabel ? ` · ${tempLabel}` : ''} · trocken.`
            : `Best outdoor window: ${windowLabel}${tempLabel ? ` · ${tempLabel}` : ''} · dry.`,
        }
    }
  })()

  const iconColor = verdict.kind === 'wet' ? 'var(--color-ink-2)' : 'var(--color-amber-2, var(--color-amber))'

  return (
    <div className="rounded-[20px] px-5 py-3.5 flex items-center gap-3" style={cardStyle} data-testid="weather-nudge">
      <Icon size={18} strokeWidth={2} style={{ color: iconColor, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{text}</span>
    </div>
  )
}

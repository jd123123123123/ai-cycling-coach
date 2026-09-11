import { useEffect, useId, useState } from 'react'
import { ArrowDown, ArrowUpRight, Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Droplets, Moon, Sun, Wind } from 'lucide-react'
import type { TodayWeather, WeatherHour } from '../../hooks/useTodayWeather'
import './w3weatherNudge.css'

const rounded = (value: number | null | undefined) => value != null && Number.isFinite(value) ? String(Math.round(value)) : '—'
const directions = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW']
export function windDirection(value: number | null) {
  return value != null && Number.isFinite(value) ? directions[Math.round(((value % 360) + 360) % 360 / 45) % 8] : null
}

/** Forecast timestamps are athlete-local wall-clock values, not browser-local. */
function localHour(timezone: string | null | undefined, now: Date): string | null {
  if (!timezone) return null
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  } catch { return null }
  const p = (key: string) => parts.find(part => part.type === key)?.value
  const date = `${p('year')}-${p('month')}-${p('day')}`
  return `${date}T${p('hour')}`
}

export function upcomingWeather(forecast: TodayWeather | undefined, now: Date) {
  const hour = localHour(forecast?.timezone, now)
  if (!forecast?.available || !hour) return []
  const date = hour.slice(0, 10)
  return forecast.hours.filter(h => h.time.startsWith(date) && h.time.slice(0, 13) >= hour)
    .sort((a, b) => a.time.localeCompare(b.time))
    .filter(h => [h.temp_c, h.precip_prob, h.wind_kmh].some(v => v != null && Number.isFinite(v)))
}

function Condition({ hour, size = 24 }: { hour: WeatherHour; size?: number }) {
  const code = hour.code
  const Icon = code == null ? null : code >= 95 ? CloudLightning : (code >= 71 && code <= 77) || code === 85 || code === 86 ? CloudSnow : code >= 51 ? CloudRain : code >= 45 ? CloudFog : code === 3 ? Cloud : code > 0 ? hour.is_day === false ? CloudMoon : CloudSun : hour.is_day === false ? Moon : Sun
  const label = code == null ? 'Keine Wetterlage' : code >= 95 ? 'Gewitter' : Icon === CloudSnow ? 'Schnee' : Icon === CloudRain ? 'Regen' : Icon === CloudFog ? 'Nebel' : code === 3 ? 'Bewölkt' : code > 0 ? 'Teilweise bewölkt' : hour.is_day === false ? 'Klar' : 'Sonnig'
  return <span role="img" aria-label={label} className="w3-weather-condition" data-sun={hour.is_day !== false && code != null && code <= 2}>
    {Icon ? <Icon size={size} strokeWidth={1.7} aria-hidden /> : '—'}
  </span>
}

export default function W3WeatherNudge({ forecast, now }: { forecast?: TodayWeather; now?: Date }) {
  const [clock, setClock] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const uid = useId()
  useEffect(() => {
    if (now) return
    const timer = window.setInterval(() => setClock(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [now])
  const hours = upcomingWeather(forecast, now ?? clock)
  if (!hours.length) return null
  const active = hours.find(h => h.time === selected) ?? hours[0]
  const direction = windDirection(active.wind_dir_deg)
  const activeLabel = active.time.slice(0, 13) === localHour(forecast?.timezone, now ?? clock) ? 'Jetzt' : `${Number(active.time.slice(11, 13))} Uhr`
  return <section className="w3-overview-card w3-weather" data-expanded={expanded} data-today-card="weather" aria-labelledby={`${uid}-title`}>
    <div className="w3-overview-header">
      <h2 className="w3-overview-title" id={`${uid}-title`}>Wetter</h2>
      <span className="w3-weather-selected-time">{activeLabel}</span>
      <button type="button" className="w3-overview-toggle" aria-label={`Wetter ${expanded ? 'schließen' : 'öffnen'}`} aria-expanded={expanded} aria-controls={`${uid}-hours`} onClick={() => setExpanded(!expanded)}><ArrowUpRight size={16} aria-hidden style={{transform:expanded?'rotate(180deg)':undefined,transition:'transform 200ms'}} /></button>
    </div>
    <div className="w3-weather-summary" aria-live="polite">
      <div className="w3-weather-reading"><Condition hour={active} size={25}/><strong>{rounded(active.temp_c)}°</strong></div>
      <div className="w3-weather-reading" aria-label={`Wind ${rounded(active.wind_kmh)} Kilometer pro Stunde${direction ? ` aus ${direction}` : ''}`}><Wind size={19} aria-hidden/><strong>{rounded(active.wind_kmh)}</strong><span>km/h{direction && <small>aus {direction}</small>}</span></div>
      <div className="w3-weather-reading w3-weather-rain" aria-label={`Regenwahrscheinlichkeit ${rounded(active.precip_prob)} Prozent`}><Droplets size={18} aria-hidden/><strong>{rounded(active.precip_prob)}<span>%</span></strong></div>
    </div>
    <div className="w3-weather-expander" data-expanded={expanded} inert={!expanded} aria-hidden={!expanded} id={`${uid}-hours`}>
      <div className="w3-weather-expand-inner">
        <div className="w3-weather-hours" aria-label="Stündliche Wettervorhersage">
          {hours.map(h => <button type="button" key={h.time} className="w3-weather-hour" aria-pressed={active.time === h.time}
            aria-label={`${h.time.slice(11, 16)} Uhr: ${rounded(h.temp_c)} Grad, Wind ${rounded(h.wind_kmh)} km/h${windDirection(h.wind_dir_deg) ? ` aus ${windDirection(h.wind_dir_deg)}` : ''}, Regenwahrscheinlichkeit ${rounded(h.precip_prob)} Prozent`}
            onClick={() => setSelected(h.time)}>
            <span className="w3-weather-time">{h.time.slice(0, 13) === localHour(forecast?.timezone, now ?? clock) ? 'Jetzt' : `${Number(h.time.slice(11, 13))} Uhr`}</span>
            <Condition hour={h}/><span className="w3-weather-hour-temp">{rounded(h.temp_c)}°</span>
            <span className="w3-weather-hour-rain"><Droplets size={11} aria-hidden/>{rounded(h.precip_prob)}%</span>
            <span className="w3-weather-hour-wind">{h.wind_dir_deg != null && <ArrowDown size={13} style={{transform:`rotate(${h.wind_dir_deg}deg)`}} aria-hidden/>}{rounded(h.wind_kmh)}</span>
          </button>)}
        </div>
        <div className="w3-weather-detail" aria-live="polite"><span><Wind size={15} aria-hidden/>Böen <b>{rounded(active.wind_gust_kmh)} km/h</b></span><span>Wind in km/h</span></div>
        <details className="w3-weather-source"><summary>Standort & Quelle</summary><p>Standort deiner letzten GPS-Fahrt. Pfeile zeigen die Strömungsrichtung. Vorhersage von <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>.</p></details>
      </div>
    </div>
  </section>
}

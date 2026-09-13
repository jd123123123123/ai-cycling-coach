import { useId, type CSSProperties } from 'react'
import './w3morning-weather.css'

// Open-Meteo's WMO condition is independent of precipitation probability.
// An absent or unrecognised code must never turn into a sunny forecast.
export function weatherSceneKind(code?: number | null) {
  if (code === 0 || code === 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloud'
  if (code === 45 || code === 48) return 'fog'
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code ?? -1)) return 'rain'
  if ([71,73,75,77,85,86].includes(code ?? -1)) return 'snow'
  if ([95,96,99].includes(code ?? -1)) return 'storm'
  return 'unknown'
}
export function weatherSceneLabel(code?: number | null, isDay?: boolean | null) {
  const kind = weatherSceneKind(code)
  return { clear:isDay === false ? 'Klarer Himmel' : code === 1 ? 'Überwiegend klar' : 'Klarer Himmel', partly:'Leicht bewölkt', cloud:'Bewölkt', fog:'Nebel', rain:'Regen erwartet', snow:'Schnee erwartet', storm:'Gewitter erwartet', unknown:'Wetterlage offen' }[kind]
}

type Props = { code?: number | null; isDay?: boolean | null; wind?: number | null; paused?: boolean }
export default function W3MorningWeatherScene({code, isDay, wind, paused=false}:Props) {
  const id = useId().replaceAll(':','')
  const kind = weatherSceneKind(code)
  const wet = kind === 'rain' || kind === 'storm'
  const clouds = ['partly','cloud','rain','snow','storm'].includes(kind)
  const celestial = kind === 'clear' || kind === 'partly'
  const speed = wind != null && Number.isFinite(wind) ? Math.max(0,wind) : null
  const style = {'--mw-flow':`${Math.max(1.4, 7 - (speed ?? 0) / 7)}s`, '--mw-cloud-time':`${Math.max(5,18-(speed ?? 0)/4)}s`} as CSSProperties
  return <div className="mw-scene" data-kind={kind} data-paused={paused} style={style} role="img" aria-label={`${weatherSceneLabel(code,isDay)} · Vorhersage${speed != null ? `, Wind ${Math.round(speed)} km/h` : ''}`}>
    <svg viewBox="0 0 160 92" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-light`}><stop stopColor="var(--mj-acid)" stopOpacity=".25"/><stop offset="1" stopColor="var(--mj-acid)" stopOpacity="0"/></radialGradient>
        <radialGradient id={`${id}-sun`} cx=".35" cy=".25" r=".8"><stop stopColor="#f4ffcf"/><stop offset=".5" stopColor="var(--mj-acid)"/><stop offset="1" stopColor="#91a94b"/></radialGradient>
        <linearGradient id={`${id}-cloud`} x1="65" y1="25" x2="78" y2="68" gradientUnits="userSpaceOnUse"><stop stopColor="#e5e9e7" stopOpacity=".9"/><stop offset=".45" stopColor="#9fa9a9" stopOpacity=".85"/><stop offset="1" stopColor="#566163" stopOpacity=".35"/></linearGradient>
        <linearGradient id={`${id}-flow`}><stop stopColor="var(--mj-sky)" stopOpacity="0"/><stop offset=".6" stopColor="var(--mj-sky)" stopOpacity=".65"/><stop offset="1" stopColor="var(--mj-sky)" stopOpacity="0"/></linearGradient>
        <mask id={`${id}-moon`}><rect width="160" height="92" fill="white"/><circle cx="81" cy="22" r="18" fill="black"/></mask>
      </defs>
      {celestial && <g className="mw-light"><circle cx="70" cy="40" r="53" fill={`url(#${id}-light)`}/><circle cx="70" cy="38" r="18" fill={isDay === false ? 'var(--mj-sky)' : `url(#${id}-sun)`} mask={isDay === false ? `url(#${id}-moon)` : undefined}/></g>}
      {clouds && <>
        <g className="mw-cloud mw-cloud-back" opacity=".35" transform="translate(22 -8) scale(.85)"><path d="M45 65c-20 0-22-27-3-31 4-24 39-28 48-3 24-9 40 29 14 34Z" fill={`url(#${id}-cloud)`}/></g>
        <g className="mw-cloud"><path d="M45 65c-20 0-22-27-3-31 4-24 39-28 48-3 24-9 40 29 14 34Z" fill={`url(#${id}-cloud)`}/><path d="M43 35c4-19 34-23 44-5" stroke="white" strokeOpacity=".25" strokeLinecap="round"/></g>
      </>}
      {kind === 'fog' && <g className="mw-fog" stroke="var(--mj-sky)" strokeWidth="6" strokeLinecap="round" opacity=".4"><path d="M40 30h68M26 44h104M42 58h70"/></g>}
      {(wet || kind==='snow') && <g className="mw-precip" stroke="var(--mj-sky)" strokeLinecap="round">{Array.from({length:7},(_,i)=><g className={wet?'mw-drop':'mw-flake'} key={i} style={{animationDelay:`-${i*.31}s`}}>{wet ? <path d={`M${44+i*10} 66l-3 8`} strokeWidth="1.5"/> : <circle cx={44+i*10} cy={68+i%3*5} r="1.8" fill="var(--mj-ink)" stroke="none"/>}</g>)}</g>}
      {kind==='storm' && <path d="m81 50-12 18h10l-5 14 19-22H82l6-10Z" fill="var(--mj-acid)" opacity=".9"/>}
      {speed != null && speed >= 5 && <g className="mw-streams" stroke={`url(#${id}-flow)`} strokeWidth="1" strokeLinecap="round"><path className="mw-stream" d="M-20 74C15 70 30 84 65 77s52-10 100-5"/><path className="mw-stream" style={{animationDelay:'-2s'}} d="M-35 86c40-8 55-2 91-3s57-8 100-3"/></g>}
      {kind==='unknown' && <g stroke="var(--mj-muted)" strokeWidth="1" opacity=".45"><circle cx="78" cy="41" r="20" strokeDasharray="2 5"/><path d="M72 41h12" strokeLinecap="round"/></g>}
    </svg>
  </div>
}

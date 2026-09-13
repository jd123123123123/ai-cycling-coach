import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, CloudSun, Droplets, Info, Moon, Pause, Play, Wind, X } from 'lucide-react'
import { T, FONT } from './w3tokens'
import W3TopBar from './W3TopBar'
const W3StatusBar = () => <div style={{ flexShrink: 0, height: 'max(12px, env(safe-area-inset-top))' }} aria-hidden />
import { MORNING_JOURNEYS, morningJourneyIndex } from './w3MorningDestinations'
import type { Contributor, MorningBriefing } from './useMorningBriefing'
import './w3morning-journeys.css'
import './w3morning-editorial.css'
import './w3.css'
import W3MorningWeatherScene, { weatherSceneLabel } from './W3MorningWeatherScene'

const SELECTED_PLACE = 'ridr.morning.selected-place.v1'
const clamp = (n: number) => Math.max(0, Math.min(1, n))
function initialPlace() {
  try { const found = MORNING_JOURNEYS.findIndex(j => j.id === localStorage.getItem(SELECTED_PLACE)); if (found >= 0) return found } catch { /* Storage is optional. */ }
  return morningJourneyIndex()
}

export function morningNightInsight(b: MorningBriefing): string {
  if (!b.contributors.length && !b.night) return 'Deine Nachtwerte stehen noch aus.'
  const warning = b.contributors.find(c => c.tone === 'warn')
  if (warning) return warning.sentence
  return b.contributors.find(c => c.key === 'sleep')?.sentence ?? 'Deine Nacht im Überblick.'
}

function Spectrum({ signal }: { signal: Contributor }) {
  return <div className="mj-spectrum" role="img" aria-label={`${signal.label}: ${signal.value}${signal.bandLabel ? `, Vergleichsbereich ${signal.bandLabel}` : ', Vergleichsbereich noch offen'}`}>
    {signal.band && <i style={{ left: `${clamp(signal.band.lo) * 100}%`, width: `${Math.max(0, clamp(signal.band.hi) - clamp(signal.band.lo)) * 100}%` }} />}
    {signal.at != null && <b style={{ left: `${clamp(signal.at) * 100}%`, background: signal.tone === 'good' ? T.acid : signal.tone === 'warn' ? T.tintPeach : T.mid }} />}
  </div>
}

function MiniWorkout({ briefing: b }: { briefing: MorningBriefing }) {
  const blocks = b.tone === 'rest' ? [] : b.blocks
  const max = Math.max(1, ...blocks.map(block => block.watts ?? 0))
  return <div className="mj-beams" aria-hidden="true">{blocks.length ? blocks.map((block, i) => <i key={i} style={{ flex: Math.max(1, block.minutes), height: `${block.watts == null ? 12 : Math.max(15, block.watts / max * 100)}%`, background: block.watts == null ? 'var(--mj-rule)' : block.watts / max > .75 ? 'var(--mj-acid)' : 'var(--mj-muted)' }} />) : b.tone === 'rest' ? <Moon size={26} strokeWidth={1.25} /> : <span className="mo-empty-workout"/>}</div>
}

type Props = { briefing: MorningBriefing; onClose: () => void; onToday: () => void; primaryRef?: RefObject<HTMLButtonElement | null> }

export default function W3MorningJourneys({ briefing: b, onClose, onToday, primaryRef }: Props) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(initialPlace)
  const [paused, setPaused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [view, setView] = useState<'morning' | 'gallery' | 'night' | 'day'>('morning')
  const [photoFailed, setPhotoFailed] = useState(false)
  const [signalKey, setSignalKey] = useState<string | null>(null)
  const [hour, setHour] = useState<number | null>(null)
  const [blockIndex, setBlockIndex] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const previousView = useRef(view)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const journey = MORNING_JOURNEYS[index]
  const score = b.readiness?.score
  const sleep = b.contributors.find(c => c.key === 'sleep')
  const activeSignal = b.contributors.find(c => c.key === signalKey) ?? b.contributors.find(c => c.tone === 'warn') ?? sleep ?? b.contributors[0]
  const hours = b.window?.hours.filter(h => h.rideable) ?? []
  const windowHours = hours.filter(h => b.window?.bestFrom != null && b.window?.bestTo != null && h.hour >= b.window.bestFrom && h.hour <= b.window.bestTo)
  const rangeValue = (key: 'temp' | 'rain' | 'wind') => { const values = windowHours.map(h => h[key]); return values.length && values.every(v => v != null) ? values as number[] : null }
  const temps = rangeValue('temp'), rains = rangeValue('rain'), winds = rangeValue('wind')
  const lowTemp = temps ? Math.round(Math.min(...temps)) : null, highTemp = temps ? Math.round(Math.max(...temps)) : null
  const windowTemp = lowTemp == null ? '—' : lowTemp === highTemp ? `${lowTemp}°` : `${lowTemp}–${highTemp}°`
  const windowRain = rains ? `${Math.round(Math.max(...rains))}%` : '—'
  const windowWind = winds ? `${Math.round(Math.max(...winds))} km/h` : '—'
  const weather = hours.find(h => h.hour === hour) ?? hours.find(h => h.hour === b.window?.bestFrom) ?? hours[0]
  const forecastStart = windowHours[0] ?? weather
  const weatherPaused = !!reduced || paused || hidden
  const rest = b.tone === 'rest'
  const selectedBlock = b.blocks[Math.min(blockIndex, b.blocks.length - 1)]
  const selectPlace = (next: number) => {
    setIndex(next); setPhotoFailed(false)
    try { localStorage.setItem(SELECTED_PLACE, MORNING_JOURNEYS[next].id) } catch { /* Keep this visit usable. */ }
  }
  const change = (delta: number) => selectPlace((index + delta + MORNING_JOURNEYS.length) % MORNING_JOURNEYS.length)
  useEffect(() => {
    const oldOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const visibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('visibilitychange', visibility); previousFocus?.focus() }
  }, [])
  useEffect(() => {
    if (previousView.current === view) return
    previousView.current = view
    if (view === 'morning') root.current?.querySelector<HTMLButtonElement>('.mj-today')?.focus()
    else back.current?.focus()
  }, [view])
  useLayoutEffect(() => {
    if (view !== 'morning') return
    const hero = root.current?.querySelector<HTMLElement>('.mo-hero')
    if (!hero) return
    const measure = () => root.current?.style.setProperty('--mo-photo-height', `${hero.getBoundingClientRect().bottom - (root.current?.getBoundingClientRect().top ?? 0) + 32}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(hero)
    return () => observer.disconnect()
  }, [view])
  const openSignal = (key?: string) => { setSignalKey(key ?? null); setView('night') }
  const toneText = rest ? 'Die nächste Runde kann warten.' : journey.saying
  // Invitation, not a second clinical label. The score and measured exception
  // keep their own factual context directly beside and below this headline.
  const verdict = rest ? ['Heute darfst du', 'loslassen.']
    : score == null ? ['Schön, dass', 'du da bist.']
    : b.contributors.some(c => c.tone === 'warn') || score < 50 ? ['Du musst heute', 'nichts beweisen.']
    : b.tone === 'unknown' ? ['Worauf hast du', 'heute Lust?']
    : score < 65 || b.tone === 'easy' ? ['Genieß deine Runde.', 'In deinem Tempo.']
    : score >= 80 ? ['Heute steckt', 'was in dir.']
    : ['Freu dich auf', 'deine Runde.']
  const warning = b.contributors.find(c => c.tone === 'warn')
  const knownNight = b.contributors.length > 0 || b.night != null
  const stageColor = (key: string) => key === 'deep' ? T.tintLilac : key === 'rem' ? T.tintSky : key === 'awake' ? T.mid : T.ink
  const styles = { '--mj-bg': T.heroBg, '--mj-ink': T.ink, '--mj-muted': T.mid, '--mj-acid': T.acid, '--mj-rule': `${T.ink}22`, '--mj-surface': T.heroDock, '--mj-deep': T.tintInk, '--mj-peach': T.tintPeach, '--mj-sky': T.tintSky, '--mj-lilac': T.tintLilac, fontFamily: FONT } as CSSProperties
  return <div ref={root} className="w3-root mj-root" style={styles} role="dialog" aria-modal="true" aria-label="Dein Morgen" onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); if (view !== 'morning') setView('morning'); else onClose() }
    if (e.key === 'Tab') {
      const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }}>
    {view === 'morning' ? <>
      <div className="mj-landscape" data-paused={!!reduced || paused || hidden}>
        <AnimatePresence initial={false}>{!photoFailed && <motion.img key={journey.id} src={journey.image} alt={journey.name + ', ' + journey.region} style={{ objectPosition: journey.position }} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .55 }} onError={() => setPhotoFailed(true)} fetchPriority="high" />}</AnimatePresence>
      </div>
      <div className="mo-main">
        <W3StatusBar /><W3TopBar title={b.greeting} onClose={onClose} />
        <section className="mo-hero" aria-label="Tourinspiration" onTouchStart={e => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }} onTouchEnd={e => { if (!swipe.current) return; const dx = e.changedTouches[0].clientX - swipe.current.x, dy = e.changedTouches[0].clientY - swipe.current.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) change(dx < 0 ? 1 : -1); swipe.current = null }}>
          <div className="mo-photo-tools">{!reduced && <button aria-label={paused ? 'Animation fortsetzen' : 'Animation pausieren'} aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button>}<button aria-label="Ort und Bildnachweis" onClick={() => setView('gallery')}><Info size={17}/></button></div>
          <div className="mo-cover"><p key={toneText}>{toneText}</p><div className="mo-location"><span>{journey.name}</span><span>{journey.region.split(' · ')[0]}</span></div></div>
          <div className="mo-scenes" role="group" aria-label="Drei Tourmotive">{MORNING_JOURNEYS.map((j,i) => <button key={j.id} aria-label={`${j.name} als Morgenmotiv ansehen`} aria-pressed={i === index} onClick={() => selectPlace(i)}><img src={j.image} alt="" style={{objectPosition:j.position}}/><span>{j.name}</span></button>)}</div>
        </section>
        <motion.div className="mo-report" initial={reduced ? false : { opacity:0, y:16 }} animate={{ opacity:1,y:0 }} transition={{duration:.65,delay:reduced?0:.12,ease:[.16,1,.3,1]}}>
          <section className="mo-night" aria-label="Deine Nacht und Bereitschaft">
            <button className="mo-verdict" onClick={() => openSignal()} aria-label="Nacht und Bereitschaft im Detail"><div><h1>{verdict[0]}{' '}<br/>{verdict[1]}</h1></div><div className="mo-score"><strong>{score ?? '—'}</strong><span>Bereitschaft</span>{b.readiness?.delta != null && <small>{b.readiness.delta>0?'+':''}{b.readiness.delta} zu gestern</small>}</div></button>
            <div className="mo-night-values">
              <button className="mo-sleep" onClick={() => openSignal('sleep')}><span>Schlaf</span><strong>{sleep?.value ?? b.night?.totalLabel ?? '—'}</strong>{b.night?.stages.length ? <div className="mo-sleep-ribbon" role="img" aria-label="Anteile der gemessenen Schlafphasen">{b.night.stages.filter(s=>s.minutes>0).map(s=><i key={s.key} style={{flex:s.minutes,background:stageColor(s.key)}}/>)}</div> : <span className="mo-no-stages">{sleep ? 'Schlafphasen offen' : 'Noch offen'}</span>}</button>
              {['hrv','rhr'].map(key=>{ const c=b.contributors.find(s=>s.key===key);const metric=key==='hrv'?b.night?.hrv:b.night?.rhr;const delta=metric?.delta;return <button key={key} onClick={()=>openSignal(key)}><span>{key==='hrv'?'HRV':'Ruhepuls'}</span><strong>{c?.value ?? metric?.value ?? '—'}</strong>{c && <Spectrum signal={c}/>}<small style={{color:c?.tone==='warn'?T.tintPeach:c?.tone==='good'?T.acid:T.mid}}>{delta != null ? `${delta>0?'+':''}${delta} ${key==='hrv'?'%':'bpm'} zur Basis` : c?.band ? 'Im Vergleich ansehen' : 'Vergleich offen'}</small></button>})}
            </div>
            <div className="mo-night-meaning" style={{color:warning?T.tintPeach:T.mid}}><span>{!knownNight ? 'Nachtwerte stehen noch aus.' : warning?.sentence ?? sleep?.sentence ?? 'Messwerte vorhanden.'}</span></div>
          </section>
          <section className="mo-training" aria-label="Dein heutiger Plan">
            <button className="mo-workout" onClick={()=>setView('day')} aria-label={`${b.headline}${b.headlineMeta?`, ${b.headlineMeta}`:''}. Training im Detail`}><div className="mo-training-heading"><div><span>{rest || b.tone === 'unknown' ? 'Heute' : 'Heute im Plan'}</span><h2>{b.headline}</h2></div><ArrowRight size={21}/></div><div className="mo-workout-shape"><MiniWorkout briefing={b}/><strong>{b.headlineMeta ?? (rest?'Pause':'Offen')}</strong></div></button>
            {!rest && weather && <button className="mw-window" onClick={()=>setView('day')} aria-label="Wetter und Fahrzeit im Detail" title="Bild: Vorhersage zum Start. Werte: Temperaturspanne, höchste Niederschlagswahrscheinlichkeit und stärkster Wind im Fahrfenster.">
              <W3MorningWeatherScene code={forecastStart?.code} isDay={forecastStart?.isDay} wind={forecastStart?.wind} paused={weatherPaused}/>
              <div className="mw-window-copy"><div><strong>{b.window?.label.replaceAll(':00','') ?? 'Wetter'} Uhr</strong><span>{windowTemp}</span></div><div><span><Droplets size={13}/>{windowRain}</span><span><Wind size={14}/>{windowWind}</span></div></div>
            </button>}
            {rest && <p className="mo-rest-line">Heute gehört die Zeit dir.</p>}
          </section>
          <button ref={primaryRef} className="mj-today mo-today" onClick={onToday}>Mein Tag<ArrowRight size={22}/></button>
        </motion.div>
      </div>
    </> : <div className="mj-detail mo-expanded"><div className="mo-detail-backdrop" aria-hidden="true"><img src={journey.image} alt="" style={{objectPosition:journey.position}}/></div>
      <W3StatusBar/><header className="mj-detail-nav"><button ref={back} onClick={() => setView('morning')} aria-label="Zurück zum Morgen"><ArrowLeft size={20}/></button><span>{view === 'gallery' ? 'Orte, die bleiben.' : view === 'night' ? 'Deine Nacht' : 'Dein Tag'}</span><button onClick={onClose} aria-label="Schließen"><X size={20}/></button></header>
      {view === 'gallery' ? <>
        <div className="mo-places"><h1>Drei Gründe,<br/>rauszugehen.</h1><p>Tourinspiration · keine heutige Routenempfehlung</p><div>{MORNING_JOURNEYS.map((j,i)=><button key={j.id} onClick={()=>{selectPlace(i);setView('morning')}} aria-label={`${j.name} als Morgenmotiv ansehen`}><img src={j.image} alt="" style={{objectPosition:j.position}}/><div><span>{j.region}</span><strong>{j.name}</strong></div>{index===i&&<Check size={18}/>}</button>)}</div><footer><span>Aktuelles Motiv · {journey.name}</span><a href={journey.source} target="_blank" rel="noreferrer">Foto: {journey.author}</a><a href={journey.licenseUrl} target="_blank" rel="noreferrer">{journey.license}</a></footer></div>
      </> : view === 'night' ? <div className="mj-night-detail">
        <div className="mj-detail-lead"><span>{b.readinessVerdict ?? 'Dein persönlicher Überblick'}</span><h1>{morningNightInsight(b)}</h1></div>
        <div className="mj-detail-scores"><div><span>Schlaf</span><strong>{sleep?.value ?? b.night?.totalLabel ?? '—'}</strong></div><div><span>Bereitschaft</span><strong>{score ?? '—'}<small>{score != null ? '/100' : ''}</small></strong></div></div>
        {!!b.night?.stages.length && <section className="mj-sleep-stages"><div className="mj-sleep-bar" aria-label="Anteile der gemessenen Schlafphasen">{b.night.stages.filter(s => s.minutes > 0).map(s => <i key={s.key} style={{ flex: s.minutes, background: s.key === 'deep' ? T.tintLilac : s.key === 'rem' ? T.tintSky : s.key === 'awake' ? T.mid : T.ink }}/>)}</div><div>{b.night.stages.map(s => <span key={s.key}><i style={{ background: s.key === 'deep' ? T.tintLilac : s.key === 'rem' ? T.tintSky : s.key === 'awake' ? T.mid : T.ink }}/>{s.label.toLowerCase()}<b>{s.minutes} min</b></span>)}</div></section>}
        <div className="mj-signal-tabs">{b.contributors.map(c => <button key={c.key} aria-pressed={activeSignal?.key === c.key} onClick={() => setSignalKey(c.key)}>{c.label}</button>)}</div>
        {activeSignal ? <div className="mj-signal-detail" aria-live="polite"><div><span>{activeSignal.label}</span><strong>{activeSignal.value}</strong></div><Spectrum signal={activeSignal}/><p>{activeSignal.sentence}</p><span>{activeSignal.bandLabel ? `Vergleichsbereich ${activeSignal.bandLabel}` : 'Dein persönlicher Vergleich ist noch offen.'}</span></div> : <p className="mj-detail-copy">{b.why ?? 'Nach dem Sync siehst du hier deine Messwerte.'}</p>}
        {score == null && <p className="mj-detail-copy">Bereitschaft noch nicht verfügbar.</p>}
        <button className="mj-detail-next" onClick={() => setView('day')}>Was steht heute an?<ArrowRight size={20}/></button>
      </div> : <div className="mj-day-detail">
        <div className="mj-detail-lead"><span>{rest ? 'Heute ist Ruhetag' : 'Deine geplante Einheit'}</span><h1>{b.headline}</h1><strong>{b.headlineMeta}</strong></div>
        {!rest && b.blocks.length > 0 ? <section className="mj-workout-detail"><div>{b.blocks.map((block, i) => <button key={i} onClick={() => setBlockIndex(i)} aria-pressed={i === blockIndex} aria-label={`${block.label}, ${block.minutes} Minuten${block.watts != null ? `, ${block.watts} Watt` : ''}`} style={{ flex: Math.max(1, block.minutes) }}><i style={{ height: `${block.watts == null ? 10 : Math.max(15, block.watts / Math.max(1, ...b.blocks.map(s => s.watts ?? 0)) * 100)}%`, background: i === blockIndex ? T.acid : T.mid }}/></button>)}</div><p aria-live="polite"><span>{selectedBlock?.label}</span><strong>{selectedBlock?.minutes} min{selectedBlock?.watts != null ? ` · ${selectedBlock.watts} W` : ''}</strong></p></section> : <div className="mj-rest"><Moon size={56} strokeWidth={1}/><p>{rest ? 'Die Berge laufen nicht weg.' : 'Deine Einheit ist noch nicht verfügbar.'}</p></div>}
        {b.why && <p className="mj-detail-copy">{b.why}</p>}
        {!rest && weather && <section className="mj-day-weather"><div className="mw-detail-sky"><W3MorningWeatherScene code={weather.code} isDay={weather.isDay} wind={weather.wind} paused={weatherPaused}/><div><span>Vorhersage · {weather.hour} Uhr</span><h2>{weatherSceneLabel(weather.code, weather.isDay)}</h2></div></div><div className="mj-hours" role="group" aria-label="Wetterstunde">{hours.map(h => <button key={h.hour} onClick={() => setHour(h.hour)} aria-pressed={h.hour === weather.hour}>{h.hour}<span>Uhr</span></button>)}</div><div className="mj-weather-values"><span><CloudSun size={20}/><strong>{weather.temp == null ? '—' : `${Math.round(weather.temp)}°`}</strong>Temperatur</span><span><Droplets size={20}/><strong>{weather.rain == null ? '—' : `${Math.round(weather.rain)}%`}</strong>Regen</span><span><Wind size={20}/><strong>{weather.wind == null ? '—' : Math.round(weather.wind)}</strong>km/h {weather.dir}</span></div></section>}
        <button className="mj-today" onClick={onToday}>Mein Tag<ArrowRight size={22}/></button>
      </div>}
    </div>}
  </div>
}

import W3RideBestEfforts from './W3RideBestEfforts'
import type { ReactNode, CSSProperties } from 'react'
import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, ChevronDown, RefreshCw, Share2, Trophy } from 'lucide-react'
import { T, FONT } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import W3RideMapHero, { type W3RideHeroVm } from './W3RideMapHero'
import './w3.css'
import './w3RideReport.css'

export interface W3Repeat { label: string; watts: string; delta: number; verdict: string }
export interface W3Zone { z: string; name: string; min: string; pct: number; peak: boolean }
/** Modelled load at the ride date, compared with the preceding week. */
export interface W3Shift {
  key: string
  label: string
  value: string
  delta: string
  up: boolean
  /** Whether this direction is a good thing. Fatigue is never "good": it is the
   *  cost of the ride, and acid on this screen means you did something well. */
  good: boolean
  /** 0–1 on the quantity's own fixed scale. */
  fill: number
  /** Where it stood a week ago, same scale. Null with no history. */
  was: number | null
}

export interface W3Rank {
  durationSeconds: number
  dur: string
  /** The ride's own figure. */
  watts: string
  /** The record for that duration, or null when there is no history yet. */
  bestWatts: string | null
  wattsValue: number
  bestWattsValue: number | null
  /** "−22 W" · "NEUER BESTWERT" — the distance to the record, already signed. */
  note: string
  pr: boolean
  /** 0–1: the ride as a fraction of the record. The beam's lit part. */
  fill: number
}
export interface W3StatCard { v: string; l: string; s: string }

export interface MovedRow { label: string; delta: string; value: string; goal: string; beforePct: number; pct: number }

export interface W3RideVm {
  dateChip: string; sportChip: string; recordChip: string | null
  title: string
  bigStat: string; bigStatUnit: string; climb: string; avgSpeed: string
  power: number[]; powerNote: string
  // The GPX of the route + the ride's intensity (IF). Kept on the vm as well
  // as inside `hero` because the sections further down read them too — the
  // hero is a VIEW of this ride, not a second source of truth about it.
  // `intensity` used to sit here too. It was set by the page on every render
  // and read by nothing — the hero draws the IF beam from its own vm — so it
  // was one more slot the page had to keep correct for no reader.
  polyline: [number, number][] | null
  /** Everything the map-and-card hero renders. See `W3RideMapHero`. */
  hero: W3RideHeroVm
  // "What it moved you toward" — real season totals + this ride's contribution.
  movedSub: string; moved: MovedRow[]; movedFoot: string
  stats: W3StatCard[]                // 4
  execScore: string; execTotal: string
  verdictHeadline: string; verdictBody: string; aiModel: string | null
  repeatsScore: string; repeatsSub: string; repeats: W3Repeat[]
  zonesSub: string; zones: W3Zone[]
  ranksSub: string; ranks: W3Rank[]
  onYouDelta: string; ceilingLabel: string; ceilingBefore: string; ceilingAfter: string
  shifts: W3Shift[]
  fitness: string; fitnessD: string; fatigue: string; fatigueD: string; form: string; formD: string
  changesBody: string
}

/**
 * The composed hero for this ride — the rider's own avatar, on their own bike,
 * in a scene built from this ride's terrain. Read-only state: the View never
 * fetches or renders anything, `W3RideDetailPage` owns the calls.
 *
 * `loading` covers the cache read still being in flight (and any read error):
 * the route trace is instant and real, so it stands in rather than a spinner.
 */
export type W3SceneStatus =
  | 'loading'
  | 'ok'                       // `image` is a data URI, ready to be the cover
  | 'not_generated'            // rider + bike exist — composing is one tap away
  | 'needs_rider'              // send them to the avatar studio first
  | 'needs_bike'               // send them to the bike studio first
  | 'image_model_unavailable'  // no image model server-side; offer nothing

export interface W3RideSceneState {
  status: W3SceneStatus
  image: string | null   // data:image/png;base64,… — only ever set with 'ok'
  pending: boolean       // the compose call is in flight (it can take ~2 min)
  failed: boolean        // the last explicit compose attempt errored out
}

/** No scene prop → the cover behaves exactly as it did before: the route trace. */
const SCENE_IDLE: W3RideSceneState = { status: 'loading', image: null, pending: false, failed: false }

export interface W3RideDetailProps {
  vm: W3RideVm
  stageRewards?: ReactNode
  trainingReview?: ReactNode
  /** Omitted → the cover stays the route trace, exactly as before. */
  scene?: W3RideSceneState
  /** Explicit intent only: this fires the slow, paid image-model call. */
  onCompose?: () => void
  onOpenStudio?: (kind: 'rider' | 'bike') => void
  onBack?: () => void
  onShare?: () => void
  /** "Nochmal fahren" — rehearse this ride's own route against the rider's
   *  CURRENT physiology. Absent when the ride has no GPS track. */
  onRehearse?: (() => void) | null
  rehearsePending?: boolean
  rehearseError?: string | null
  /** Opens the route full-screen. Omitted when there is nothing to open. */
  onExpandMap?: () => void
}


const ZONE_TINT = [T.d3, T.cool, T.training, T.acid, T.warn, T.bad]
type Evidence = 'Bestwerte' | 'Zonen' | 'Belastung' | 'Jahr' | 'Anstiege'

/** Facts from the selected activity; interpretation and model assumptions stay disclosed. */
export default function W3RideDetailView({ stageRewards, vm, trainingReview, scene = SCENE_IDLE, onCompose, onOpenStudio, onBack, onShare, onExpandMap, onRehearse, rehearsePending, rehearseError }: W3RideDetailProps) {
  const uid = useId()
  const reduce = useReducedMotion()
  const tabs: Evidence[] = [
    ...(vm.ranks.length ? ['Bestwerte' as const] : []),
    ...(vm.zones.length && !trainingReview ? ['Zonen' as const] : []),
    ...(vm.shifts.length ? ['Belastung' as const] : []),
    ...(vm.moved.length ? ['Jahr' as const] : []),
    ...(vm.repeats.length ? ['Anstiege' as const] : []),
  ]
  const [chosen, setChosen] = useState<Evidence>('Bestwerte')
  const active = tabs.includes(chosen) ? chosen : tabs[0]
  const record = vm.ranks.find(r => r.pr)
  const hasSceneAction = !vm.hero.sceneImage && (scene.pending || scene.failed || ['not_generated', 'needs_rider', 'needs_bike'].includes(scene.status))
  const css = {fontFamily:FONT, '--report-bg':T.bg, '--report-surface':T.surface, '--report-ink':T.ink, '--report-mid':T.mid, '--report-line':T.rule, '--report-acid':T.acid, '--report-track':T.d1} as CSSProperties
  return <div className="w3-root"><div className="w3-frame w3-ride-report" style={css}>
    <W3StatusBar />
    <W3TopBar title="Fahrt" onBack={onBack} extra={onShare ? <button className="w3-report-icon" type="button" aria-label="Fahrt teilen" onClick={onShare}><Share2 size={18}/></button> : undefined}/>
    <W3RideMapHero editorial vm={vm.hero} onExpandMap={onExpandMap}/>

    {record && <button className="w3-report-record" type="button" onClick={()=>{setChosen('Bestwerte');document.getElementById(`${uid}-analysis`)?.scrollIntoView({behavior:reduce?'instant':'smooth',block:'start'})}}>
      <Trophy size={22} strokeWidth={1.5}/><span><small>Neuer persönlicher Bestwert</small><strong>{record.bestWattsValue!=null&&record.wattsValue>record.bestWattsValue?`+${(record.wattsValue-record.bestWattsValue).toLocaleString('de-DE',{maximumFractionDigits:1})} W`:record.watts}<span>{record.bestWattsValue!=null?`${record.watts} · `:''}{record.dur.toLowerCase()}</span></strong></span><ArrowUpRight size={18}/>
    </button>}

    {trainingReview ?? <section className="w3-report-fallback"><span className="w3-report-label">Dein Rückblick</span><h2>Deine Fahrt ist erfasst.</h2><p>Strecke, Belastung und Bestwerte findest du hier im Detail.</p>{vm.verdictBody && <details><summary>Coaching-Auswertung <ChevronDown size={16}/></summary><p>{vm.verdictBody}</p><small>Automatische Interpretation deiner Aufzeichnung.</small></details>}</section>}
    {stageRewards}

    {!!tabs.length && <section className="w3-report-analysis" id={`${uid}-analysis`} aria-label="Fahrtanalyse">
      <div className="w3-report-section-heading"><h2>Deine Analyse</h2><span>{vm.hero.dateLine.split(' · ')[0]}</span></div>
      <div className="w3-report-tabs" role="tablist" aria-label="Analyse auswählen">{tabs.map((tab,i)=><button id={`${uid}-${tab}`} key={tab} type="button" role="tab" aria-selected={active===tab} aria-controls={`${uid}-panel`} tabIndex={active===tab?0:-1} onClick={()=>setChosen(tab)} onKeyDown={e=>{const delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(delta||e.key==='Home'||e.key==='End'){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+delta+tabs.length)%tabs.length;setChosen(tabs[next]);document.getElementById(`${uid}-${tabs[next]}`)?.focus()}}}>{tab}</button>)}</div>
      <motion.div key={active} id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${active}`} initial={reduce?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:.2}} className="w3-report-panel">
        {active==='Bestwerte' && <W3RideBestEfforts ranks={vm.ranks}/>}
        {active==='Zonen' && <>
          <p className="w3-report-panel-intro">Zeit in deinen Leistungsbereichen.</p>
          <div className="w3-report-zone-spectrum" role="img" aria-label={vm.zones.map(z=>`${z.name}: ${z.min}`).join(', ')}>{vm.zones.map((z,i)=>({z,i})).filter(({z})=>z.pct>0).map(({z,i})=><i key={z.z} style={{flex:z.pct,background:ZONE_TINT[Math.min(i,5)]}}/>)}</div>
          {vm.zones.map((z,i)=><div className="w3-report-zone" key={z.z}><i style={{background:ZONE_TINT[Math.min(i,5)]}}/><span>{z.name}</span><strong>{z.min}</strong></div>)}
          <details><summary>Einordnung <ChevronDown size={16}/></summary><p>{vm.zonesSub}</p></details>
        </>}
        {active==='Belastung' && <>
          <p className="w3-report-panel-intro">Modellierter Stand am Tag dieser Fahrt.</p>
          <div className="w3-report-model">{vm.shifts.map(sh=><div key={sh.key}><span>{sh.label.toLowerCase()}</span><strong>{sh.value}</strong>{sh.delta&&<small>{sh.delta} zur Vorwoche</small>}</div>)}</div>
          <p className="w3-report-explanation">{vm.changesBody}</p>
          <details><summary>Was diese Werte bedeuten <ChevronDown size={16}/></summary><p>Fitness, Ermüdung und Form beschreiben deine modellierte Trainingsbelastung. Die Veränderung umfasst die gesamte Woche bis zu dieser Fahrt. Sie belegt keinen Leistungsgewinn durch eine einzelne Einheit.</p></details>
        </>}
        {active==='Jahr' && <>
          <p className="w3-report-panel-intro">Dein Jahr bis zu dieser Fahrt.</p>
          {vm.moved.map(m=><div className="w3-report-year" key={m.label}><div><span>{m.label}</span><strong>{m.value}{m.goal&&<small> / {m.goal}</small>}</strong></div><span>{m.delta}</span></div>)}
          {vm.movedFoot&&<p className="w3-report-explanation">{vm.movedFoot}</p>}
        </>}
        {active==='Anstiege' && <>
          <p className="w3-report-panel-intro">Ähnliche Anstiege im Vergleich zu ihrem eigenen Schnitt.</p>
          {vm.repeats.map((r,i)=><div className="w3-report-repeat" key={i}><span>{r.label}</span><strong>{r.watts}</strong><span>{r.delta>0?'+':''}{r.delta} W</span></div>)}
          <p className="w3-report-explanation">{vm.repeatsSub}</p>
        </>}
      </motion.div>
    </section>}

    {!!vm.stats.length && <details className="w3-report-metrics"><summary>Weitere Messwerte <ChevronDown size={18}/></summary><dl>{vm.stats.map(s=><div key={s.l}><dt>{s.l}</dt><dd>{s.v}</dd><p>{s.s}</p></div>)}</dl></details>}
    {hasSceneAction&&<details className="w3-report-metrics"><summary>Dein Fahrtbild <ChevronDown size={18}/></summary>
      {scene.pending?<p role="status">Dein Bild wird erstellt…</p>:<>
        {scene.failed&&<p>Das Bild konnte nicht erstellt werden. Du kannst es erneut versuchen.</p>}
        {scene.status==='needs_rider'?<button className="w3-report-text-action" type="button" onClick={()=>onOpenStudio?.('rider')}>Avatar erstellen <ArrowUpRight size={18}/></button>:scene.status==='needs_bike'?<button className="w3-report-text-action" type="button" onClick={()=>onOpenStudio?.('bike')}>Rad hinzufügen <ArrowUpRight size={18}/></button>:<button className="w3-report-text-action" type="button" onClick={onCompose}>Fahrtbild erstellen <ArrowUpRight size={18}/></button>}
      </>}
    </details>}
    {onRehearse&&<div className="w3-report-repeat-route"><button type="button" disabled={rehearsePending} onClick={onRehearse}><RefreshCw size={20}/><span><strong>{rehearsePending?'Wird vorbereitet…':'Diese Strecke nochmal fahren'}</strong><small>Mit deiner aktuellen Form planen</small></span><ArrowUpRight size={18}/></button>{rehearseError&&<p role="alert">{rehearseError}</p>}</div>}
  </div></div>
}

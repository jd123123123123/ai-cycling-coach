import { useId, useState, type CSSProperties } from 'react'
import { ArrowUpRight, ArrowRight, ChevronDown, Check } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { TrainingReview } from '../../api/trainingReview'
import { T, FONT } from './w3tokens'
import { smoothCurve } from './w3SmoothCurve'
import './w3trainingReview.css'

const fmt = (n: number | null, unit = '') => n == null ? '—' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`
const signed = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const impactMetrics = [{ key: 'fitness', label: 'Fitness' }, { key: 'fatigue', label: 'Ermüdung' }, { key: 'form', label: 'Form' }] as const

type ReviewBlock = { w: number; work: boolean; label: string; start: number; duration: number; value: number }

/** The width represents elapsed time, including unmeasured gaps. Means are
 * weighted by sample duration; exact recorded samples remain on the scrubber. */
export function reviewBlocks(trace: TrainingReview['trace'], field: 'actual_pct' | 'planned_pct', endMinutes: number): ReviewBlock[] {
  const limits = [55, 75, 90, 105, 120, 150]
  const groups: { zone: number; weighted: number; duration: number; start: number; end: number }[] = []
  for (let i = 0; i < trace.length; i++) {
    const point = trace[i], value = point[field]
    if (value == null) continue
    const end = trace[i + 1]?.at_s ?? Math.max(point.at_s, endMinutes * 60)
    const duration = Math.max(0, end - point.at_s)
    if (!duration) continue
    const found = limits.findIndex(limit => value <= limit)
    const zone = found < 0 ? 6 : found
    const previous = groups.at(-1)
    if (previous && previous.zone === zone && previous.end === point.at_s) {
      previous.weighted += value * duration
      previous.duration += duration
      previous.end = end
    } else groups.push({ zone, weighted: value * duration, duration, start: point.at_s, end })
  }
  return groups.map(group => {
    const value = group.weighted / group.duration
    return { w: Math.min(1, value / 125), work: group.zone >= 2, start: group.start, duration: group.duration, value,
      label: `${clock(group.start)}–${clock(group.end)} · Ø ${fmt(value)} % FTP` }
  })
}

function hasSavedPlan(review: TrainingReview) {
  return Boolean(review.planned_title?.trim()) && (review.score != null || review.pairs.some(pair => pair.planned != null)
    || review.trace.some(point => point.planned_pct != null) || review.zones.some(zone => zone.planned_seconds != null))
}

function isHistorical(rideDate?: string | null) {
  if (!rideDate) return false
  const ride = new Date(rideDate)
  if (Number.isNaN(ride.getTime())) return false
  const today = new Date()
  return new Date(ride.getFullYear(), ride.getMonth(), ride.getDate()).getTime()
    < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
}

export function reviewComparison(review:TrainingReview){
  const duration=review.pairs.find(p=>p.label==='Dauer')
  const load=review.pairs.find(p=>p.unit==='TSS')
  const planned=hasSavedPlan(review)
  const durationDelta=planned&&duration?.actual!=null&&duration.planned!=null?duration.actual-duration.planned:null
  const loadDelta=planned&&load?.actual!=null&&load.planned!=null?load.actual-load.planned:null
  return {duration,load,durationDelta,loadDelta,planned}
}

/** Trace entries are interval averages. End each measured run at its known
 * boundary, preserving null gaps and the final duration rather than dropping it. */
export function reviewTracePoints(trace: TrainingReview['trace'], field: 'actual_pct'|'planned_pct', endSeconds?:number) {
 const points:({x:number;y:number}|null)[]=[]
 trace.forEach((p,i)=>{
  if(p[field]==null||(endSeconds!=null&&p.at_s>=endSeconds)){points.push(null);return}
  points.push({x:p.at_s,y:p[field]!})
  const next=trace[i+1]
  if(!next||next[field]==null||(endSeconds!=null&&next.at_s>=endSeconds)){
   const end=Math.min(next?.at_s??endSeconds??p.at_s,endSeconds??Infinity)
   if(end>p.at_s)points.push({x:end,y:p[field]!})
   points.push(null)
  }
 })
 return points
}

function ReviewProfile({review,planned}:{review:TrainingReview;planned:boolean}){
 const [mode,setMode]=useState<'trace'|'zones'>(review.trace.length?'trace':'zones')
 const [elapsed,setElapsed]=useState<number|null>(null)
 const visible=review.zones.map((zone,index)=>({...zone,index})).filter(z=>(z.actual_seconds??0)>0||(planned&&(z.planned_seconds??0)>0))
 const dominant=visible.reduce((best,z)=>!best||(z.actual_seconds??0)>(best.actual_seconds??0)?z:best,visible[0])
 const [selectedZone,setSelectedZone]=useState<string|null>(null)
 const zone=visible.find(z=>z.label===selectedZone)??dominant
 const reduce=useReducedMotion()
 const duration=review.pairs.find(p=>p.label==='Dauer')
 const seconds=Math.max(1,(duration?.actual??0)*60,planned?(duration?.planned??0)*60:0,review.trace.at(-1)?.at_s??0)
 const ceiling=Math.max(125,...review.trace.flatMap(p=>[p.actual_pct??0,planned?p.planned_pct??0:0]))
 const x=(t:number)=>12+t/seconds*316,y=(v:number)=>177-v/ceiling*147
 const chartPath=(field:'actual_pct'|'planned_pct')=>{
   const end=(field==='actual_pct'?duration?.actual:duration?.planned)
   const points=reviewTracePoints(review.trace,field,end==null?undefined:end*60).map(p=>p?{x:x(p.x),y:y(p.y)}:null)
   return smoothCurve(points)
 }
 const actualPath=chartPath('actual_pct'),plannedPath=planned?chartPath('planned_pct'):''
 const sample=elapsed==null?null:review.trace.filter(p=>p.at_s<=elapsed).at(-1)??review.trace[0]
 const point=sample&&elapsed!=null?{...sample,at_s:elapsed,
  actual_pct:duration?.actual!=null&&elapsed>duration.actual*60?null:sample.actual_pct,
  planned_pct:duration?.planned!=null&&elapsed>duration.planned*60?null:sample.planned_pct,
 }:null
 const maxDose=Math.max(60,...visible.flatMap(z=>[z.actual_seconds??0,planned?z.planned_seconds??0:0]))
 const colors=[T.mid,T.cool,T.training,T.acid,T.warn,T.bad]
 if(!review.trace.length&&!visible.length)return null
 return <div className="w3-review-chart-panel">
  <div className="w3-review-chart-tabs" role="group" aria-label="Trainingsgrafik">
   {!!review.trace.length&&<button type="button" aria-pressed={mode==='trace'} onClick={()=>setMode('trace')}>Verlauf</button>}
   {!!visible.length&&<button type="button" aria-pressed={mode==='zones'} onClick={()=>setMode('zones')}>Leistungsbereiche</button>}
  </div>
  {mode==='trace'?<>
   <div className="w3-review-chart-legend"><span><i/>Gefahren</span>{plannedPath&&<span><i/>Plan</span>}<span>{point?clock(point.at_s):'% FTP'}</span></div>
   <div className="w3-review-overlay-plot">
    <svg viewBox="0 0 340 200" role="img" aria-label={planned?"Gefahrene Leistung und gespeicherte Empfehlung auf gleicher Zeit- und FTP-Skala":"Gefahrene Leistung über die Zeit"}>
     {[50,100].map(v=><g key={v}><line x1="12" x2="328" y1={y(v)} y2={y(v)} stroke={T.rule}/><text x="12" y={y(v)-6} fill={T.mid} fontSize="11">{v===100?'FTP':`${v} %`}</text></g>)}
     {planned&&duration?.planned!=null&&duration.planned*60<seconds&&<><rect x={x(duration.planned*60)} y="22" width={328-x(duration.planned*60)} height="155" fill={T.acid} opacity=".045"/><line x1={x(duration.planned*60)} x2={x(duration.planned*60)} y1="22" y2="177" stroke={T.mid} strokeDasharray="3 5"/></>}
     {actualPath&&<motion.path initial={false} animate={{d:actualPath}} transition={{duration:reduce?0:.35}} stroke={T.acid} strokeWidth="2.6" strokeLinecap="round" fill="none"/>}
     {plannedPath&&<path d={plannedPath} stroke={T.ink} strokeWidth="1.4" strokeDasharray="4 5" strokeLinecap="round" opacity=".65" fill="none"/>}
     {point&&<><line x1={x(point.at_s)} x2={x(point.at_s)} y1="22" y2="177" stroke={T.mid}/>{point.actual_pct!=null&&<circle cx={x(point.at_s)} cy={y(point.actual_pct)} r="4" fill={T.acid} stroke={T.bg} strokeWidth="2"/>}</>}
     <text x="12" y="198" fill={T.mid} fontSize="12">0</text><text x="328" y="198" textAnchor="end" fill={T.mid} fontSize="12">{fmt(seconds/60)} min</text>
    </svg>
    <input className="w3-review-trace-scrubber" type="range" min="0" max={seconds} value={elapsed??0} aria-label="Abschnitt der Fahrt auswählen" aria-valuetext={point?`${clock(point.at_s)}, gefahren ${fmt(point.actual_pct)} Prozent FTP${planned?`, empfohlen ${fmt(point.planned_pct)} Prozent FTP`:''}`:'Start der Fahrt'} onChange={e=>setElapsed(Number(e.target.value))}/>
   </div>
   {point&&<div className="w3-review-sample"><span>{fmt(point.actual_pct)} % FTP</span>{planned&&<span>Plan {fmt(point.planned_pct)} %</span>}</div>}
  </>:<>
   {zone&&<div className="w3-review-zone-reading"><span>{zone.label}</span><strong>{fmt(zone.actual_seconds==null?null:zone.actual_seconds/60)}<small>min</small></strong>{planned&&zone.planned_seconds!=null&&<span>Plan {fmt(zone.planned_seconds/60)} min</span>}</div>}
   <div className="w3-review-zone-columns">{visible.map(z=><button type="button" key={z.label} aria-pressed={zone?.label===z.label} aria-label={`${z.label}: ${fmt(z.actual_seconds==null?null:z.actual_seconds/60,'min')} gefahren${planned&&z.planned_seconds!=null?`, ${fmt(z.planned_seconds/60,'min')} empfohlen`:''}`} onClick={()=>setSelectedZone(z.label)}><span className="w3-review-zone-column"><i style={{height:`${(z.actual_seconds??0)/maxDose*100}%`,background:colors[Math.min(z.index,5)]}}/>{planned&&z.planned_seconds!=null&&<b style={{bottom:`${Math.min(99,z.planned_seconds/maxDose*100)}%`}}/>}</span><span>Z{z.index+1}</span></button>)}</div>
   <div className="w3-review-chart-legend w3-review-zone-legend"><span><i/>Gefahren</span>{planned&&<span><i/>Plan</span>}<span>Minuten</span></div>
  </>}
 </div>
}

export default function W3TrainingReview({ review: r, onOpenPlan, rideDate }: { review: TrainingReview; onOpenPlan?: () => void; rideDate?: string | null }) {
  const [day, setDay] = useState(0), [metric, setMetric] = useState<'fitness' | 'fatigue' | 'form'>('form')
  const reduce = useReducedMotion(), uid = useId()
  const historical = isHistorical(rideDate), planned = hasSavedPlan(r)
  const recommendationSaved = Boolean(r.planned_title?.trim())
  const point = r.impact[Math.min(day, r.impact.length - 1)]
  const scale = Math.max(1, ...r.impact.map(item => Math.abs(item[metric])))
  const x = (index: number) => 28 + index / Math.max(1, r.impact.length - 1) * 248
  const y = (value: number) => 65 - value / scale * 36
  const path = smoothCurve(r.impact.map((item,index)=>({x:x(index),y:y(item[metric])})))
  const hasDeviation = r.impact.some(item => Math.abs(item.fitness) > .01 || Math.abs(item.fatigue) > .01 || Math.abs(item.form) > .01)
  const adaptation = r.adaptation
  const pairs = r.pairs.filter(pair => pair.actual != null && (planned && pair.planned != null || pair.unit === 'TSS' || pair.label === 'Dauer'))
  const hasPlanOutcome = adaptation != null || r.changes.length > 0
  const {durationDelta,loadDelta,duration,load}=reviewComparison(r)
  const loadLeads=loadDelta!=null&&Math.abs(loadDelta)>=1&&Math.abs(loadDelta)/Math.max(1,load?.planned??1)>Math.abs(durationDelta??0)/Math.max(1,duration?.planned??1)
  const dominant=r.zones.filter(z=>(z.actual_seconds??0)>0).sort((a,b)=>(b.actual_seconds??0)-(a.actual_seconds??0))[0]
  return <section className="w3-training-review" style={{ fontFamily: FONT, '--w3-surface': T.surface, '--w3-ink': T.ink, '--w3-mid': T.mid, '--w3-d2': T.d2, '--w3-acid': T.acid, '--w3-hero-ink': T.heroInk, '--w3-soft': T.surface2 } as CSSProperties} aria-label="Trainingsrückblick">
    <header className="w3-review-benefit">
      <span className="w3-review-eyebrow">{planned?"Fahrt × Plan":"Deine Aufzeichnung"}</span>
      <h2>{loadLeads?<>{signed(loadDelta!)} TSS<br/><span>{loadDelta!>0?'über dem Plan.':'unter dem Plan.'}</span></>:durationDelta!=null&&Math.abs(durationDelta)>=1?<>{fmt(Math.abs(durationDelta))} min<br/><span>{durationDelta>0?'länger gefahren.':'kürzer gefahren.'}</span></>:planned&&r.score!=null&&r.score>=80?<>Deinen Plan<br/><span>getroffen.</span></>:dominant?<>{fmt(dominant.actual_seconds!/60)} min<br/><span>{dominant.label}.</span></>:<>Deine Fahrt ist erfasst.</>}</h2>
      {loadLeads&&durationDelta!=null&&Math.abs(durationDelta)>=1?<div className="w3-review-consequence"><span>{fmt(Math.abs(durationDelta))} min {durationDelta>0?'länger':'kürzer'}</span><span>als {historical?'damals ':''}empfohlen</span></div>:loadDelta!=null&&Math.abs(loadDelta)>=1?<div className="w3-review-consequence"><span>{signed(loadDelta)} TSS</span><span>{historical?'zur damaligen Empfehlung':'zur Empfehlung'}</span></div>:!planned&&dominant?<div className="w3-review-consequence">Dein längster gemessener Leistungsbereich</div>:null}
    </header>
    <ReviewProfile key={r.activity_id} review={r} planned={planned}/>
    {pairs.length>0&&<div className="w3-review-comparisons">{pairs.map(pair=>{
      const maximum=Math.max(1,pair.actual??0,planned?pair.planned??0:0)
      return <div key={pair.label}><div><span>{pair.label}</span><strong>{fmt(pair.actual)}<small>{pair.unit}</small></strong></div><div className="w3-review-total-track" role="img" aria-label={`${pair.label}: ${fmt(pair.actual,pair.unit)} gefahren${planned&&pair.planned!=null?`, ${fmt(pair.planned,pair.unit)} empfohlen`:''}`}><i style={{width:`${(pair.actual??0)/maximum*100}%`}}/>{planned&&pair.planned!=null&&<b style={{left:`${Math.min(99,pair.planned/maximum*100)}%`}}/>}</div>{planned&&pair.planned!=null&&<small>Plan {fmt(pair.planned,pair.unit)}</small>}</div>
    })}</div>}
    {(hasPlanOutcome||onOpenPlan||Boolean(r.action))&&<div className="w3-review-next">
      <div className="w3-review-next-heading"><span>{r.changes.length?(historical?'Damals angepasst':'Plan angepasst'):historical?(adaptation?.automatic?'Damals berücksichtigt':'Planprüfung zu dieser Fahrt'):'Dein nächster Schritt'}</span>{adaptation?.automatic&&<Check size={17} aria-label="Automatisch berücksichtigt"/>}</div>
      {r.changes.length>0?<>{r.changes.slice(0,1).map(change=><div className="w3-review-adaptation" key={change.date}><div><strong>{new Date(`${change.date}T12:00:00`).toLocaleDateString('de-DE',{weekday:'short'})}</strong><span>{new Date(`${change.date}T12:00:00`).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</span></div><div><del>{change.before}</del><strong>{change.after}</strong></div><ArrowRight size={20}/></div>)}<details><summary>Warum diese Änderung? <ChevronDown size={15}/></summary>{r.changes.map((change,i)=><p key={i}>{i>0&&`${change.date}: ${change.before} → ${change.after}. `}{change.reason}</p>)}</details></>:<p>{adaptation?.state==='pending'?'Auswertung ausstehend':adaptation?.state==='limited'?'Datengrundlage begrenzt':historical?'Keine Änderung dieser Fahrt zugeordnet.':adaptation?.reason??r.action}</p>}
      {onOpenPlan&&<button type="button" className="w3-review-open" aria-label="Trainingsplan öffnen" onClick={onOpenPlan}>Trainingsplan<ArrowUpRight size={18}/></button>}
    </div>}
    {planned && point && <details className="w3-review-impact"><summary>Modellierte Planabweichung <ChevronDown size={16} /></summary>
      {hasDeviation ? <>
        <div className="w3-review-heading"><span>Belastungsmodell</span><span>{day === 0 ? 'Nach der Fahrt' : `${day} ${day === 1 ? 'Tag' : 'Tage'} danach`}</span></div>
        <div className="w3-review-impact-values">{impactMetrics.map(item => <button key={item.key} type="button" aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}><span>{item.label}</span><strong>{signed(point[item.key])}</strong>{metric === item.key && <motion.i layoutId={`${uid}-metric`} transition={{ duration: reduce ? 0 : .2 }} />}</button>)}</div>
        <svg viewBox="0 0 310 124" role="img" aria-label={`Modellierte ${impactMetrics.find(item => item.key === metric)!.label}abweichung gegenüber der empfohlenen Einheit für ${r.impact.length} Tage`}
          onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); setDay(Math.round(Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * 310 - 28) / 248)) * (r.impact.length - 1))) }}>
          <line x1="28" x2="276" y1="65" y2="65" stroke={T.quiet} strokeDasharray="3 5" /><text x="276" y="59" fill={T.mid} textAnchor="end" fontSize="12">Plan · 0</text>
          <text x="28" y="19" fill={T.mid} fontSize="12">+{fmt(scale)}</text><text x="28" y="119" fill={T.mid} fontSize="12">−{fmt(scale)}</text>
          <motion.path initial={false} animate={{ d: path }} transition={{ duration: reduce ? 0 : .22 }} fill="none" stroke={T.acid} strokeWidth="2.5" strokeLinejoin="round" />
          <motion.circle initial={false} animate={{ cx: x(day), cy: y(point[metric]) }} transition={{ duration: reduce ? 0 : .15 }} r="4" fill={T.acid} />
        </svg>
        <div className="w3-review-days" role="group" aria-label="Tag der Belastungsprognose">{r.impact.map((item, index) => <button key={item.day} type="button" aria-pressed={day === index} onClick={() => setDay(index)}>{index === 0 ? 'Fahrt' : `+${index}`}</button>)}</div>
      </> : <p className="w3-review-on-plan"><Check size={15} />Belastung wie geplant</p>}
      <p>{r.impact_basis} Belastungsmodellwerte, keine nachgewiesenen Leistungszuwächse.</p>
    </details>}
    <details className="w3-review-method"><summary>Einordnung & Datengrundlage <ChevronDown size={16} /></summary>
      {planned&&r.score!=null?<p role="img" aria-label={`${r.score} von 100 Planpassung`}>Planpassung: {r.score} / 100.</p>:<p>{recommendationSaved?'Empfehlung gespeichert · Vergleich noch nicht gesichert':'Keine gespeicherte Empfehlung für diese Fahrt'}</p>}
      <p>{r.stimulus_detail}</p><p>Die Leistungsbereiche beschreiben gemessene Leistung. Ob deine Leistungsfähigkeit gestiegen ist, zeigen erst vergleichbare Folgemessungen.</p>
      {planned && <p>{r.headline} {r.summary}</p>}
      <p>{r.method}</p><p>Empfehlung: {r.planned_title ?? 'Nicht gespeichert'}. {r.coverage == null ? 'Keine Leistungsmessung.' : `${Math.round(r.coverage * 100)} % Leistungsabdeckung.`}</p>
      {r.limitations.map(limit => <p key={limit}>{limit}</p>)}
      <p>Die Verlaufsgrafik zeigt zusammengefasste Abschnittswerte, keine sekündlichen Rohdaten. Fehlende Abschnitte bleiben frei; der Regler liest die vorhandenen Abschnittswerte ab. Der Zonenvergleich bewertet Zeitverteilung, nicht die exakte Abfolge einzelner Intervalle.</p>
      {adaptation && !adaptation.automatic && !historical && <p>{adaptation.reason}</p>}
    </details>
  </section>
}

import { useId, useState, type CSSProperties } from 'react'
import { ArrowUpRight, ArrowRight, ChevronDown, Check } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { TrainingReview } from '../../api/trainingReview'
import { T, FONT } from './w3tokens'
import { IntervalBars, type W3Block } from './W3Sections'
import './w3trainingReview.css'

const fmt=(n:number|null,unit='') => n == null ? '—' : `${n.toLocaleString('de-DE',{maximumFractionDigits:1})}${unit ? ` ${unit}` : ''}`
const signed=(n:number) => `${n>0?'+':''}${fmt(n)}`
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`
const impactMetrics=[{key:'fitness',label:'Fitness'},{key:'fatigue',label:'Ermüdung'},{key:'form',label:'Form'}] as const

/** Same schematic blocks and 125% FTP scale as today's recommendation.
 * Adjacent samples in one power zone become one labelled mean-power block;
 * the exact sampled trace remains available through the time scrubber. */
export function reviewBlocks(trace:TrainingReview['trace'], field:'actual_pct'|'planned_pct', endMinutes:number):W3Block[] {
 const limits=[55,75,90,105,120,150]
 const groups:{zone:number;sum:number;count:number;start:number;end:number}[]=[]
 for(let i=0;i<trace.length;i++){
  const p=trace[i],value=p[field]
  if(value==null)continue
  const zone=limits.findIndex(limit=>value<=limit)
  const z=zone<0?6:zone
  const end=trace[i+1]?.at_s??Math.max(p.at_s,endMinutes*60)
  const last=groups.at(-1)
  if(last&&last.zone===z&&last.end===p.at_s){last.sum+=value;last.count++;last.end=end}
  else groups.push({zone:z,sum:value,count:1,start:p.at_s,end})
 }
 return groups.map(g=>({w:Math.min(1,g.sum/g.count/125),work:g.zone>=2,label:`${clock(g.start)}–${clock(g.end)} · Ø ${fmt(g.sum/g.count)} % FTP`}))
}

function ReviewBenefit({review:r}:{review:TrainingReview}){
 const zone=r.zones.find(z=>z.label===r.stimulus)
 const minutes=zone?.actual_seconds==null?null:zone.actual_seconds/60
 const title=r.stimulus==='VO₂-Bereich'?'VO₂-Reiz gesetzt.':r.stimulus==='Ausdauer'?'Ausdauer gesammelt.':r.stimulus==='Schwelle'?'Schwellenreiz gesetzt.':r.stimulus==='Tempo'?'Temporeiz gesetzt.':r.stimulus==='Erholung'?'Locker gefahren.':r.stimulus==='Fahrt erfasst'?'Deine Fahrt zählt.':`${r.stimulus}-Reiz gesetzt.`
 return <div className="w3-review-benefit"><span className="w3-review-eyebrow">Dein Trainingsrückblick</span><h2>{title}</h2><div className="w3-review-benefit-dose">{minutes!=null?<><strong>{fmt(minutes)} min</strong><span>im {r.stimulus==='VO₂-Bereich'?'VO₂-Leistungsbereich':r.stimulus.toLowerCase()+'bereich'}</span></>:<span>Trainingsreiz noch nicht sicher bestimmbar</span>}</div><details className="w3-review-verdict"><summary>Was bringt dir das? <ChevronDown size={13}/></summary><p>{r.stimulus_detail}</p><p>Ob deine Leistung gestiegen ist, zeigen vergleichbare Folgemessungen.</p></details></div>
}

function ReviewProfile({review:r}:{review:TrainingReview}) {
 const [mode,setMode]=useState<'trace'|'zones'>('trace')
 const [recording,setRecording]=useState<'actual_pct'|'planned_pct'>('actual_pct')
 const [slice,setSlice]=useState<number|null>(null)
 const [zone,setZone]=useState<number|null>(null)
 const reduce=useReducedMotion(),uid=useId()
 const pair=r.pairs.find(p=>p.label==='Dauer')
 const minutes=Math.max(pair?.actual??0,pair?.planned??0)
 const selected=slice!=null?r.trace[Math.min(slice,r.trace.length-1)]:null
 const visibleZones=r.zones.filter(z=>(z.actual_seconds??0)>0||(z.planned_seconds??0)>0)
 const largest=Math.max(60,...visibleZones.flatMap(z=>[z.actual_seconds??0,z.planned_seconds??0]))
 const selectedZone=zone==null?null:visibleZones[zone]
 const blocks=reviewBlocks(r.trace,recording,minutes)
 if(!r.trace.length&&!visibleZones.length)return null
 return <div className="w3-review-chart-panel">
  <div className="w3-review-chart-tabs" aria-label="Trainingsgrafik">{([['trace','Verlauf'],['zones','Trainingsreiz']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{mode===key&&<motion.span layoutId={`${uid}-chart-tab`} transition={{duration:reduce?0:.22}} className="w3-review-tab-active"/>}<span>{label}</span></button>)}</div>
  <AnimatePresence mode="wait" initial={false}><motion.div key={mode} initial={reduce?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduce?0:.16}}>
  {mode==='trace'?<>
   <div className="w3-review-chart-reading"><strong>{selected?clock(selected.at_s):'Deine Einheit'}</strong><span><i style={{background:T.acid}}/>{selected?`${fmt(selected.actual_pct)} %`:'Gefahren'}</span><span><i style={{background:T.mid}}/>{selected?`${fmt(selected.planned_pct)} %`:'Empfohlen'}</span></div>
   {r.trace.length?<><div className="w3-review-recordings" aria-label="Leistungsprofil wählen">{([['actual_pct','Gefahren'],['planned_pct','Empfohlen']] as const).map(([field,label])=><button key={field} type="button" aria-pressed={recording===field} onClick={()=>setRecording(field)}>{label}</button>)}</div>
   <div className="w3-review-recommendation-beams" role="img" aria-label={`${recording==='actual_pct'?'Gefahrene':'Empfohlene'} Leistung im Balkendesign der Trainingsempfehlung; Höhe relativ zur FTP`}>
    {blocks.length?<IntervalBars blocks={blocks} ftpTag={selected?`${clock(selected.at_s)} · ${fmt(selected[recording])} % FTP`:'100 % FTP'} h={104}/>:<p className="w3-review-muted">Kein gesichertes Leistungsprofil.</p>}
   </div><div className="w3-review-axis"><span>Abschnitte · Höhe = % FTP</span><span>{fmt(minutes,'min')}</span></div>
   <input className="w3-review-trace-scrubber" type="range" min="0" max={r.trace.length-1} value={slice??0} aria-label="Abschnitt der Fahrt auswählen" aria-valuetext={selected?`${clock(selected.at_s)}, gefahren ${fmt(selected.actual_pct)} Prozent FTP, empfohlen ${fmt(selected.planned_pct)} Prozent FTP`:'Start der Fahrt'} onChange={e=>setSlice(Number(e.target.value))}/></>:<p className="w3-review-muted">Kein ausreichend vollständiger Leistungsverlauf.</p>}
  </>:<>
   <div className="w3-review-chart-reading"><strong>{selectedZone?.label??'Zeit im Bereich'}</strong><span><i style={{background:T.acid}}/>Ist</span><span><i style={{background:T.mid}}/>Soll</span></div>
   <div className="w3-review-zone-bars">{visibleZones.map((z,i)=><button key={z.label} type="button" aria-pressed={zone===i} onClick={()=>setZone(zone===i?null:i)}><span>{z.label}</span><span className="w3-review-zone-track"><i style={{width:`${(z.actual_seconds??0)/largest*100}%`}}/>{z.planned_seconds!=null&&<b style={{left:`${Math.min(99,z.planned_seconds/largest*100)}%`}}/>}</span><strong>{fmt(z.actual_seconds==null?null:z.actual_seconds/60)}<small> / {fmt(z.planned_seconds==null?null:z.planned_seconds/60)}</small></strong></button>)}</div>
   <div className="w3-review-zone-note">{selectedZone?`${fmt(selectedZone.actual_seconds==null?null:selectedZone.actual_seconds/60,'min')} gefahren · ${fmt(selectedZone.planned_seconds==null?null:selectedZone.planned_seconds/60,'min')} empfohlen`:'Minuten · Balken = gefahren, Markierung = empfohlen'}</div>
  </>}
  </motion.div></AnimatePresence>
 </div>
}

export default function W3TrainingReview({review:r,onOpenPlan}:{review:TrainingReview;onOpenPlan?:()=>void}) {
 const [day,setDay]=useState(0),[metric,setMetric]=useState<'fitness'|'fatigue'|'form'>('form')
 const reduce=useReducedMotion(),uid=useId()
 const tint=r.status==='matched'?T.acid:r.status==='extra'?T.warn:T.ink
 const point=r.impact[Math.min(day,r.impact.length-1)]
 const scale=Math.max(1,...r.impact.map(p=>Math.abs(p[metric])))
 const x=(i:number)=>24+i/Math.max(1,r.impact.length-1)*264
 const y=(v:number)=>60-v/scale*36
 const path=r.impact.map((p,i)=>`${i?'L':'M'}${x(i)},${y(p[metric])}`).join(' ')
 const hasDeviation=r.impact.some(p=>Math.abs(p.fitness)>.01||Math.abs(p.fatigue)>.01||Math.abs(p.form)>.01)
 const adaptation=r.adaptation
 return <section className="w3-training-review" style={{fontFamily:FONT,'--w3-surface':T.surface,'--w3-ink':T.ink,'--w3-mid':T.mid,'--w3-d2':T.d2,'--w3-acid':T.acid,'--w3-hero-ink':T.heroInk,'--w3-soft':T.surface2} as CSSProperties} aria-label="Trainingsrückblick">
  <ReviewBenefit review={r}/>
  <div className="w3-review-assessment">
   <div className="w3-review-assessment-top"><div><span>Planpassung</span><strong>{r.score==null?'Offen':r.status==='extra'?'Mehr als geplant':r.score>=80?'Reiz getroffen':'Anderer Reiz'}</strong></div>{r.score!=null&&<span className="w3-review-score-number" style={{color:tint}}><b>{r.score}</b><small>/ 100</small></span>}</div>
   {r.score!=null&&<div className="w3-review-score-ticks" role="img" aria-label={`${r.score} von 100 Planpassung`}>{Array.from({length:20},(_,i)=><i key={i} style={{background:i<Math.round(r.score!/5)?tint:T.d2}}/>)}</div>}
   <details className="w3-review-verdict"><summary>Bewertung erklären <ChevronDown size={13}/></summary><p>{r.headline} {r.summary}</p><p>{r.method}</p></details>
  </div>
  <ReviewProfile key={r.activity_id} review={r}/>
  <div className="w3-review-pairs">{r.pairs.map(p=>{const top=Math.max(1,p.actual??0,p.planned??0);const delta=p.actual!=null&&p.planned!=null?p.actual-p.planned:null;return <div key={p.label}><div className="w3-review-pair-title"><span>{p.label}</span>{delta!=null&&<small style={{color:Math.abs(delta)<.05?T.acid:T.mid}}>{Math.abs(delta)<.05?'Wie geplant':`${signed(delta)} ${p.unit}`}</small>}</div><strong>{fmt(p.actual)}<small>{p.unit}</small></strong><div className="w3-review-pair-comparison" aria-label={`${p.label}: ${fmt(p.actual,p.unit)} gefahren, ${fmt(p.planned,p.unit)} empfohlen`}><span style={{width:`${(p.actual??0)/top*100}%`,background:T.acid}}/><span style={{width:`${(p.planned??0)/top*100}%`,background:T.d3}}/></div><small>{p.planned==null?'Kein gesichertes Soll':`${fmt(p.planned,p.unit)} empfohlen`}</small></div>})}</div>
  {point&&hasDeviation&&<div className="w3-review-impact">
   <div className="w3-review-heading"><span>Wirkung gegenüber dem Plan</span><span>{day===0?'Nach der Fahrt':`${day} ${day===1?'Tag':'Tage'} danach`}</span></div>
   <div className="w3-review-impact-values">{impactMetrics.map(m=><button key={m.key} type="button" aria-pressed={metric===m.key} onClick={()=>setMetric(m.key)}><span>{m.label}</span><strong style={{color:metric===m.key?T.acid:T.ink}}>{signed(point[m.key])}</strong>{metric===m.key&&<motion.i layoutId={`${uid}-metric`} transition={{duration:reduce?0:.2}}/>}</button>)}</div>
   <svg viewBox="0 0 310 110" role="img" aria-label={`Modellierte ${impactMetrics.find(m=>m.key===metric)!.label}abweichung gegenüber der empfohlenen Einheit für ${r.impact.length} Tage`} onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();setDay(Math.round(Math.max(0,Math.min(1,((e.clientX-rect.left)/rect.width*310-24)/264))*(r.impact.length-1)))}}>
    <line x1="24" x2="288" y1="60" y2="60" stroke={T.quiet} strokeDasharray="3 5"/><text x="288" y="55" fill={T.mid} textAnchor="end" fontSize="9">Plan · 0</text>
    <text x="17" y="26" textAnchor="end" fill={T.mid} fontSize="8">+{fmt(scale)}</text><text x="17" y="98" textAnchor="end" fill={T.mid} fontSize="8">−{fmt(scale)}</text>
    <motion.path initial={false} animate={{d:path}} transition={{duration:reduce?0:.22}} fill="none" stroke={T.acid} strokeWidth="2.5" strokeLinejoin="round"/>
    <motion.circle initial={false} animate={{cx:x(day),cy:y(point[metric])}} transition={{duration:reduce?0:.15}} r="4" fill={T.acid}/>
   </svg>
   <div className="w3-review-days" aria-label="Tag der Belastungsprognose">{r.impact.map((p,i)=><button key={p.day} type="button" aria-pressed={day===i} onClick={()=>setDay(i)}>{day===i&&<motion.i layoutId={`${uid}-day`} transition={{duration:reduce?0:.2}}/>}<span>{i===0?'Fahrt':`+${i}`}</span></button>)}</div>
   <details><summary>Modell erklären</summary><p>{r.impact_basis} Belastungsmodellwerte, keine nachgewiesenen Leistungszuwächse.</p></details>
  </div>}
  {point&&!hasDeviation&&<div className="w3-review-on-plan"><Check size={15}/><span>Belastung wie geplant</span></div>}
  <div className="w3-review-next"><div className="w3-review-heading"><span>{r.changes.length?'Deine Woche wurde angepasst':adaptation?.automatic?'Deine Woche ist abgestimmt':'Deine Trainingswoche'}</span>{onOpenPlan&&<button className="w3-review-open" aria-label="Trainingsplan öffnen" onClick={onOpenPlan}><ArrowUpRight size={16}/></button>}</div>
   {adaptation&&<div className="w3-review-auto" data-active={adaptation.automatic}><Check size={12}/>{adaptation.automatic?'Automatisch berücksichtigt':adaptation.state==='pending'?'Auswertung ausstehend':'Datengrundlage begrenzt'}</div>}
   {r.changes.map((c,i)=><motion.div layout={reduce?false:'position'} className="w3-review-change" key={`${c.date}-${i}`}><div className="w3-review-change-date"><strong>{new Date(`${c.date}T12:00:00`).toLocaleDateString('de-DE',{weekday:'short'})}</strong><span>{new Date(`${c.date}T12:00:00`).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</span></div><div className="w3-review-change-content"><div><span>{c.before}</span><ArrowRight size={13}/><strong>{c.after}</strong></div><details><summary>Warum?</summary><p>{c.reason}</p></details></div></motion.div>)}
   <p>{adaptation?.automatic?adaptation.reason:r.action}</p>
   {!adaptation&&!r.changes.length&&<small>Keine dieser Fahrt zugeordnete Planänderung gespeichert.</small>}
   {adaptation?.automatic&&<small>Automatisch berücksichtigt. Du musst nichts verschieben.</small>}
  </div>
  <details className="w3-review-method"><summary>Datengrundlage <ChevronDown size={14}/></summary><p>Empfehlung: {r.planned_title??'Nicht verfügbar'}. {r.coverage==null?'Keine Leistungsmessung.':`${Math.round(r.coverage*100)} % Leistungsabdeckung.`}</p>{r.limitations.map(l=><p key={l}>{l}</p>)}<p>Zonenvergleich bewertet Zeitverteilung, nicht die exakte Abfolge einzelner Intervalle.</p>{adaptation&&!adaptation.automatic&&<p>{adaptation.reason}</p>}</details>
 </section>
}

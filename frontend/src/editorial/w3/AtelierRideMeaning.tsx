import { useId } from 'react'
import { ArrowUpRight, Clock3, Mountain, Route } from 'lucide-react'
import type { TrainingReview } from '../../api/trainingReview'
import { T } from './w3tokens'
import { smoothCurve } from './w3SmoothCurve'
import { elapsed, formatValue, type PlotModel, type RideSample } from './atelierRideData'
import { AtelierExplanation } from './AtelierExplanation'
export { CoachRead } from './AtelierCoachRead'

/** Zone exposure describes where time was spent; it is not a measured fitness gain. */
export function trainingEmphasis(zones: TrainingReview['zones']) {
  const valid = zones.map((z, index) => ({ ...z, index, seconds: Math.max(0, z.actual_seconds ?? 0) }))
    .filter(z => Number.isFinite(z.seconds) && z.seconds > 0)
  const total = valid.reduce((sum, z) => sum + z.seconds, 0)
  const focus = valid.filter(z => z.index > 0).sort((a, b) => b.seconds - a.seconds).slice(0, 2)
  return { zones: valid, total, focus, title: focus.map(z => z.label).join(' & ') || (total ? 'Locker gefahren' : 'Trainingsreiz noch offen') }
}

export function TrainingEmphasis({ review, onAnalyse }: { review: TrainingReview; onAnalyse: () => void }) {
  const { title } = trainingEmphasis(review.zones)
  return <button className="atelier-training-meaning" onClick={onAnalyse} aria-label={`Trainingsreiz: ${title}. Leistungsanalyse öffnen`}>
    <span><small>Trainiert</small><strong>{title}</strong></span><span className="atelier-meaning-open">Zonen<ArrowUpRight size={17}/></span>
  </button>
}

export function planComparisonPlot(review: TrainingReview, samples?: RideSample[], ftp?: number): PlotModel | null {
  const measured = samples && ftp && ftp > 0 ? samples.map(s => ({ seconds:s.seconds, value:s.power==null?null:s.power/ftp*100 })) : review.trace.map(s=>({seconds:s.at_s,value:s.actual_pct}))
  if (!measured.some(p=>p.value!=null)) return null
  const end=Math.max(1,...measured.map(p=>p.seconds),...review.trace.map(p=>p.at_s))
  const planned=review.planned_title?review.trace:[]
  return {low:0,high:Math.max(100,Math.ceil(Math.max(...measured.map(p=>p.value??0),...planned.map(p=>p.planned_pct??0))/50)*50),unit:'% FTP',xLabels:['0:00',elapsed(end/2),elapsed(end)],series:[
    {color:T.acid,area:true,points:measured.map(p=>p.value==null?null:{x:p.seconds/end,y:p.value})},
    {color:T.ink,dashed:true,points:planned.map(p=>p.planned_pct==null?null:{x:p.at_s/end,y:p.planned_pct})},
  ]}
}

/** Altitude is plotted against recorded distance, preserving gaps and an explicit height scale. */
export function RouteElevation({ samples, onOpen }: { samples: RideSample[]; onOpen: () => void }) {
  const id = useId()
  const heights = samples.flatMap(s => s.altitude != null && Number.isFinite(s.altitude) ? [s.altitude] : [])
  if (!heights.length) return <p className="atelier-elevation-empty">Kein Höhenverlauf aufgezeichnet.</p>
  const low = Math.floor(Math.min(...heights) / 500) * 500
  const high = Math.max(low + 500, Math.ceil(Math.max(...heights) / 500) * 500)
  const start = samples[0]?.distance ?? 0, end = samples.at(-1)?.distance ?? start
  const points = samples.map(s => s.distance == null || s.altitude == null || !Number.isFinite(s.altitude) ? null : ({
    x: 42 + (s.distance - start) / Math.max(1, end - start) * 286,
    y: 58 - (s.altitude - low) / (high - low) * 40,
  }))
  const segments: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  for (const p of points) { if (p) current.push(p); else if (current.length) { segments.push(current); current = [] } }
  if (current.length) segments.push(current)
  return <button className="atelier-route-elevation" onClick={onOpen} aria-label="Höhenprofil unter der Route. Detaillierte Höhenanalyse öffnen">
    <svg viewBox="0 0 340 83" role="img" aria-label={`Höhe von ${formatValue(low)} bis ${formatValue(high)} Metern über ${formatValue((end - start) / 1000, 1)} Kilometer`}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop stopColor={T.ink} stopOpacity=".18"/><stop offset="1" stopColor={T.ink} stopOpacity=".02"/></linearGradient></defs>
      {[{ y: 18, v: high }, { y: 58, v: low }].map(t => <g key={t.v}><text x="0" y={t.y + 3} fill={T.mid} fontSize="9">{formatValue(t.v)} m</text><path d={`M42 ${t.y}H328`} stroke={T.rule}/></g>)}
      {segments.map((segment, i) => <path key={i} d={`${smoothCurve(segment)}L${segment.at(-1)!.x} 58L${segment[0].x} 58Z`} fill={`url(#${id})`}/>)}
      <path d={smoothCurve(points)} fill="none" stroke={T.ink} strokeWidth="1.3" strokeLinejoin="round"/>
      <text x="42" y="78" fill={T.mid} fontSize="9">{formatValue(start / 1000, 1)} km</text><text x="328" y="78" textAnchor="end" fill={T.mid} fontSize="9">{formatValue(end / 1000, 1)} km</text>
    </svg>
  </button>
}

export function rideImpactPlot(review:TrainingReview):PlotModel|null {
  const points=review.impact.filter(p=>Number.isFinite(p.day)&&Number.isFinite(p.fitness)&&Number.isFinite(p.fatigue)).sort((a,b)=>a.day-b.day)
  if(!points.length)return null
  const end=Math.max(1,...points.map(p=>p.day)),values=points.flatMap(p=>[p.fitness,p.fatigue])
  return {low:Math.min(0,Math.floor(Math.min(...values)/5)*5),high:Math.max(5,Math.ceil(Math.max(...values)/5)*5),unit:'Pkt.',xLabels:['Fahrt',`+${formatValue(end/2)} Tage`,`+${end} Tage`],series:[
    {color:T.warn,area:true,points:points.map(p=>({x:p.day/end,y:p.fatigue}))},
    {color:T.acid,points:points.map(p=>({x:p.day/end,y:p.fitness}))},
  ]}
}

export type ContributionKey = 'distance' | 'time' | 'ascent'
export type RideContribution = { key: ContributionKey; label: string; unit: string; before: number | null; added: number | null }
export type RideContributions = { period: string; metrics: RideContribution[]; rideDate?:string; history?:{date:string; totals:Record<ContributionKey,number|null>}[] }
export const contributionAfter = (m: RideContribution) => m.before != null && m.added != null && Number.isFinite(m.before) && Number.isFinite(m.added) && m.before >= 0 && m.added >= 0 ? m.before + m.added : null
export const contributionValue = (value: number | null, key: ContributionKey) => {
  if (value == null || !Number.isFinite(value) || value < 0) return '—'
  if (key !== 'time') return formatValue(value, key === 'distance' ? 1 : 0)
  const minutes = Math.round(value / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

const contributionIcons = { distance: Route, time: Clock3, ascent: Mountain }

/** Actual calendar history with a highlighted final contribution. No fabricated intermediate values. */
export function contributionHistory(data:RideContributions,key:ContributionKey) {
  const metric=data.metrics.find(m=>m.key===key),after=metric?contributionAfter(metric):null
  if(!metric||!data.rideDate||after==null)return []
  const end=Date.parse(data.rideDate)
  const observed=(data.history??[]).filter(p=>Date.parse(p.date)<end&&p.totals[key]!=null&&Number.isFinite(p.totals[key])&&p.totals[key]!>=0)
    .sort((a,b)=>a.date.localeCompare(b.date)).map(p=>({date:p.date,value:p.totals[key]!}))
  return observed.length?[...observed,{date:data.rideDate,value:after}]:[]
}

export function ContributionGraphic({data,selected}:{data:RideContributions;selected:ContributionKey}) {
  const id=useId()
  const active=data.metrics.find(m=>m.key===selected)??data.metrics[0]
  if(!active)return null
  const after=contributionAfter(active),share=after!=null&&after>0?active.added!/after:null
  const history=contributionHistory(data,active.key)
  const values=history.map(p=>active.key==='time'?p.value/3600:p.value)
  const max=Math.max(1,...values),step=active.key==='ascent'?10000:active.key==='time'?50:1000,high=Math.ceil(max/step)*step
  const lo=Date.parse(history[0]?.date??''),hi=Date.parse(history.at(-1)?.date??'')
  const points=history.map((p,i)=>({x:16+(Date.parse(p.date)-lo)/Math.max(1,hi-lo)*302,y:260-values[i]/high*133}))
  const line=smoothCurve(points),last=points.at(-1),prev=points.at(-2)
  return <svg viewBox="0 0 340 368" className="atelier-contribution-graphic" role="img" aria-label={share==null?'Kein früherer Jahresstand verfügbar':`${formatValue(share*100,1)} Prozent deines bisherigen Jahresstands stammen aus dieser Fahrt`}>
    <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop stopColor={T.acid} stopOpacity=".15"/><stop offset="1" stopColor={T.acid} stopOpacity="0"/></linearGradient></defs>
    <g fill={T.ink} fontFamily="inherit">
      <text x="10" y="54" fontSize="55" letterSpacing="-2.8">{active.added==null?'—':`+${contributionValue(active.added,active.key)}`}<tspan fontSize="18" letterSpacing="0" fill={T.mid}> {active.unit}</tspan></text>
      <text x="12" y="79" fontSize="12" fill={T.mid}>{active.label} aus dieser Fahrt</text>
      {points.length>1&&last&&prev?<>
        {[0,high].map(v=><g key={v}><path d={`M16 ${260-v/high*133}H318`} stroke={T.rule}/><text x="16" y={253-v/high*133} fontSize="10" fill={T.mid}>{formatValue(v)} {active.unit}</text></g>)}
        <path d={`${line}L318 260H16Z`} fill={`url(#${id})`}/>
        <path d={line} fill="none" stroke={T.heroOff} strokeWidth="2.5" strokeLinecap="round"/>
        <path d={smoothCurve(points.slice(-2))} fill="none" stroke={T.acid} strokeWidth="3.5" strokeLinecap="round"/>
        <circle cx={last.x} cy={last.y} r="15" fill={T.acid} opacity=".08"/><circle cx={last.x} cy={last.y} r="8" fill={T.bg} stroke={T.acid} strokeOpacity=".35"/><circle cx={last.x} cy={last.y} r="3.5" fill={T.acid}/>
        <path d={`M${last.x} ${last.y-17}V${last.y-33}h-35`} fill="none" stroke={T.acid} strokeOpacity=".5"/>
        <text x={last.x-41} y={last.y-30} textAnchor="end" fontSize="11" fill={T.acid}>Diese Fahrt</text>
        {[0,.33,.66,1].map((f,i)=>{const date=new Date(lo+f*(hi-lo));return <text key={i} x={16+f*302} y="284" textAnchor={i===0?'start':i===3?'end':'middle'} fontSize="10" fill={T.mid}>{i===3?'Jetzt':date.toLocaleDateString('de-DE',{month:'short'})}</text>})}
      </>:<text x="170" y="193" textAnchor="middle" fill={T.mid} fontSize="12">Jahresverlauf noch nicht verfügbar.</text>}
      <path d="M12 308H328" stroke={T.rule}/>
      <text x="12" y="329" fontSize="10" fill={T.mid}>Vorher</text><text x="328" y="329" textAnchor="end" fontSize="10" fill={T.mid}>Jetzt</text>
      <text x="12" y="356" fontSize="23" letterSpacing="-.5">{contributionValue(active.before,active.key)}</text><path d="M159 346h22m-5-5 6 5-6 5" stroke={T.mid} fill="none"/>
      <text x="328" y="356" textAnchor="end" fontSize="23" letterSpacing="-.5">{contributionValue(after,active.key)}<tspan fontSize="11" fill={T.mid}> {active.unit}</tspan></text>
      {after==null&&<text x="170" y="217" textAnchor="middle" fill={T.mid} fontSize="11">Bisheriger Stand fehlt</text>}
    </g>
  </svg>
}

export function RideContributionView({ data, selected, onSelect }: { data: RideContributions; selected: ContributionKey; onSelect: (key: ContributionKey) => void }) {
  const active = data.metrics.find(m => m.key === selected) ?? data.metrics[0]
  if (!active) return <p className="atelier-empty">Noch keine Jahreswerte verfügbar.</p>
  return <div className="atelier-contribution">
    <div className="atelier-panel-title"><span>{data.period}</span><h2>Diese Fahrt zählt.</h2></div>
    <ContributionGraphic data={data} selected={selected}/>
    <div className="atelier-contribution-list" aria-label="Beitrag dieser Fahrt auswählen">{data.metrics.map(m => {
      const Icon = contributionIcons[m.key]
      return <button key={m.key} aria-label={`${m.label} ansehen`} aria-pressed={m.key === selected} onClick={() => onSelect(m.key)}><Icon size={19}/><strong>{m.added == null ? '—' : `+${contributionValue(m.added, m.key)}`}</strong><span>{m.key==='time'?'Stunden':m.unit}</span></button>
    })}</div>
    <AtelierExplanation title="Was wird gezählt?"><p>Fahrten seit Jahresbeginn bis zu dieser Ausfahrt. Vorher ohne diese Fahrt, jetzt inklusive. Sattelzeit ist die aufgezeichnete Fahrzeit, ohne Standzeit.</p></AtelierExplanation>
  </div>
}

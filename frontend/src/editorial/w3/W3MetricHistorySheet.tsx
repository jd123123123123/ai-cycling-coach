import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Info, X } from 'lucide-react'
import { apiClient } from '../../api/client'
import type { DailyMetricListResponse } from '../../api/dashboard'
import { T, FONT } from './w3tokens'
import { differenceFormat, historyDays, METRIC_LABEL, METRIC_UNIT, metricFormat, periodSummary, shiftDay, type HistoryDay, type RecoveryMetric } from './w3MetricHistory'
import './w3MetricHistory.css'

const dateLabel=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('de-DE',{day:'numeric',month:'short'})
const EXPLANATION:Record<RecoveryMetric,string>={
  hrv:'HRV beschreibt die Schwankung zwischen Herzschlägen. Entscheidend ist dein Verlauf im persönlichen Kontext. Ein höherer Einzelwert ist nicht automatisch besser.',
  rhr:'Dein Ruhepuls ergänzt HRV, Schlaf und Trainingsbelastung. Abweichungen können viele Ursachen haben; aus einem einzelnen Wert lässt sich keine Ursache ablesen.',
  sleep:'Die Balken zeigen deine erfasste Schlafdauer. Schlafphasen sind Schätzungen deines Wearables. Dein bisheriger Durchschnitt ist kein persönliches Schlafziel.',
}

function HistoryChart({points,metric,index,onSelect,average}:{points:HistoryDay[];metric:RecoveryMetric;index:number;average:number|null;onSelect:(index:number)=>void}) {
  const hasObservations=points.some(point=>point.value!=null)
  const svgRef=useRef<SVGSVGElement>(null)
  const [size,setSize]=useState({width:350,height:234})
  useEffect(()=>{if(!svgRef.current||typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0&&entry.contentRect.height>0)setSize({width:entry.contentRect.width,height:entry.contentRect.height})});observer.observe(svgRef.current);return()=>observer.disconnect()},[hasObservations])
  const observed=points.flatMap(p=>[p.value,p.low,p.high,p.trend].filter((n):n is number=>n!=null))
  if(!hasObservations) return <div className="w3-mh-empty">Keine Messungen in diesem Zeitraum.</div>
  const bottom=Math.max(45,size.height-24),top=16,left=12,right=size.width-32,step=(right-left)/points.length
  const min=metric==='sleep'?0:Math.max(0,Math.floor(Math.min(...observed)-Math.max(3,(Math.max(...observed)-Math.min(...observed))*.2)))
  const max=Math.ceil(Math.max(...observed)+Math.max(metric==='sleep'?1:3,(Math.max(...observed)-min)*.15))
  const x=(i:number)=>left+(i+.5)*step, y=(v:number)=>bottom-(v-min)/(max-min)*(bottom-top)
  const paths:string[]=[]; let segment=''
  points.forEach((p,i)=>{if(p.trend==null){if(segment)paths.push(segment);segment=''}else segment+=`${segment?' L':'M'}${x(i)},${y(p.trend)}`});if(segment)paths.push(segment)
  const inspect=(event:React.PointerEvent<SVGSVGElement>)=>{const matrix=event.currentTarget.getScreenCTM();if(!matrix)return;const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());onSelect(Math.max(0,Math.min(points.length-1,Math.floor((point.x-left)/step))))}
  const selected=points[index]
  return <div className="w3-mh-chart">
    <svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`${METRIC_LABEL[metric]}: Tageswerte und 7-Tage-Durchschnitt. Datum über den Regler wählen.`} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);inspect(e)}} onPointerMove={e=>{if(e.buttons)inspect(e)}} style={{touchAction:'pan-y'}}>
      {[min,(min+max)/2,max].map(value=><g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={T.rule} strokeDasharray="2 5"/><text x={size.width-1} y={y(value)+3} textAnchor="end" fill={T.mid} fontSize="9">{Math.round(value)}</text></g>)}
      {points.map((p,i)=>p.low!=null&&p.high!=null?<rect key={`b${p.date}`} x={x(i)-step/2} y={y(p.high)} width={step+.2} height={Math.max(1,y(p.low)-y(p.high))} fill={T.ink} opacity=".055"/>:null)}
      {points.map((p,i)=>p.value==null?<circle key={p.date} cx={x(i)} cy={bottom+5} r="1.5" fill={T.quiet}/>:<rect key={p.date} x={x(i)-Math.max(2,Math.min(12,step*.52))/2} y={y(p.value)} width={Math.max(2,Math.min(12,step*.52))} height={Math.max(2,bottom-y(p.value))} rx={Math.min(3,step*.2)} fill={i===index?T.acid:T.ink} opacity={i===index?1:.2}/>)}
      {average!=null&&<line x1={left} x2={right} y1={y(average)} y2={y(average)} stroke={T.ink} strokeOpacity=".55" strokeDasharray="5 5"/>}
      {paths.map((d,i)=><path key={i} d={d} fill="none" stroke={T.acid} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round"/>)}
      <line x1={x(index)} x2={x(index)} y1="12" y2={bottom+2} stroke={T.ink} strokeOpacity=".4" strokeDasharray="2 4"/>
      {selected.value!=null&&<circle cx={x(index)} cy={y(selected.value)} r="4" fill={T.acid} stroke={T.sheet} strokeWidth="2"/>}
      <text x={left} y={bottom+22} fill={T.mid} fontSize="10">{dateLabel(points[0].date)}</text><text x={right} y={bottom+22} fill={T.mid} textAnchor="end" fontSize="10">{dateLabel(points.at(-1)!.date)}</text>
    </svg>
    <input type="range" min="0" max={points.length-1} value={index} onChange={e=>onSelect(Number(e.target.value))} aria-label="Datum im Verlauf" aria-valuetext={`${dateLabel(selected.date)}: ${metricFormat(selected.value,metric)} ${METRIC_UNIT[metric]}`}/>
    <div className="w3-mh-legend"><span><i className="daily"/>Tageswert</span><span><i className="average"/>Zeitraum-Ø</span><span><i className="trend"/>7-Tage-Ø</span>{points.some(p=>p.low!=null)&&<span><i className="band"/>Persönlicher Bereich</span>}</div>
  </div>
}

export default function W3MetricHistorySheet({initialMetric,endDate,action,onClose}:{initialMetric:RecoveryMetric;endDate:string;action?:string|null;onClose:()=>void}) {
  const [metric,setMetric]=useState(initialMetric),[days,setDays]=useState(28),[index,setIndex]=useState(27)
  const [panel,setPanel]=useState<'insight'|'action'|'explain'|'peers'>('insight'),[method,setMethod]=useState(false)
  const ref=useRef<HTMLDialogElement>(null),closeRef=useRef<HTMLButtonElement>(null),id=useId(),reduce=useReducedMotion()
  const query=useQuery({queryKey:['w3','recovery-history',endDate],queryFn:async()=>{
    const response=await apiClient.get<DailyMetricListResponse>('/daily-metrics',{params:{start_date:shiftDay(endDate,-179),end_date:endDate}});return response.data
  },staleTime:5*60*1000,retry:1})
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null, dialog=ref.current, overflow=document.body.style.overflow
    dialog?.showModal(); closeRef.current?.focus();document.body.style.overflow='hidden'
    return()=>{dialog?.close();document.body.style.overflow=overflow;previous?.focus()}
  },[])
  const points=historyDays(query.data?.metrics??[],metric,endDate,days), selected=points[index]
  const seen=points.filter(p=>p.value!=null).length, last=points.findLast(p=>p.value!=null)
  const summary=periodSummary(query.data?.metrics??[],metric,endDate,days)
  const change=summary.change
  const vars={'--mh-bg':T.sheet,'--mh-tile':T.surface2,'--mh-ink':T.ink,'--mh-mid':T.mid,'--mh-acid':T.acid,'--mh-rule':T.rule,'--mh-shadow':T.shadowSoft,fontFamily:FONT} as CSSProperties
  return createPortal(<dialog ref={ref} className="w3-mh-dialog" style={vars} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <motion.section initial={reduce?false:{y:60,opacity:0}} animate={{y:0,opacity:1}} transition={{duration:.32,ease:[.16,1,.3,1]}}>
      <header className="w3-mh-header"><h2 id={id}>Deine Erholung</h2><div className="w3-mh-tools"><button className="w3-mh-close" aria-label="Grafik erklären" aria-pressed={method} onClick={()=>setMethod(!method)}><Info size={18}/></button><button ref={closeRef} className="w3-mh-close" onClick={onClose} aria-label="Verlauf schließen"><X size={20}/></button></div></header>
      <nav className="w3-mh-metrics" aria-label="Messwert">{(['hrv','rhr','sleep'] as const).map(key=><button key={key} aria-pressed={metric===key} onClick={()=>{setMetric(key);setMethod(false)}}>{METRIC_LABEL[key]}</button>)}</nav>
      <div className="w3-mh-period" aria-label="Zeitraum">{[7,28,90].map(n=><button key={n} aria-pressed={days===n} onClick={()=>{setDays(n);setIndex(n-1)}}>{days===n&&<motion.span layoutId={`${id}-period`} transition={{duration:reduce?0:.2}}/>}<b>{n} Tage</b></button>)}</div>
      {method?<div className="w3-mh-method"><h3>So liest du deinen Verlauf</h3><dl><dt>Tageswerte</dt><dd>Balken zeigen die erfassten Werte. Fehlende Tage bleiben offen.</dd><dt>Zeitraum-Ø</dt><dd>Durchschnitt der Messungen in den ausgewählten {days} Tagen. Der Vergleich nutzt die {days} Tage davor; beide benötigen mindestens 50 % erfasste Tage.</dd><dt>7-Tage-Trend</dt><dd>Gleitender Durchschnitt der jeweils letzten 7 Tage, ab 4 Messungen.</dd><dt>Persönlicher Bereich</dt><dd>Die mittleren 50 % der Werte aus den jeweils vorherigen 28 Tagen, ab 14 Messungen. Statistischer Vergleich, keine Gesundheitsgrenze.</dd></dl><p>{metric!=='sleep'?'Die senkrechte Skala passt sich deinem Verlauf an und beginnt nicht zwingend bei null.':'Schlafdauer in Stunden. Schlafphasen sind Schätzungen des Wearables.'}</p><button onClick={()=>setMethod(false)}>Zur Grafik</button></div>:query.isPending?<div className="w3-mh-empty" role="status">Dein Verlauf wird geladen …</div>:query.isError?<div className="w3-mh-empty" role="alert">Verlauf konnte nicht geladen werden.<button onClick={()=>query.refetch()}>Erneut laden</button></div>:<>
        <div className="w3-mh-reading"><div><div className="w3-mh-date"><button disabled={index===0} onClick={()=>setIndex(index-1)} aria-label="Vorheriger Tag"><ChevronLeft size={15}/></button><span>{dateLabel(selected.date)}</span><button disabled={index===days-1} onClick={()=>setIndex(index+1)} aria-label="Nächster Tag"><ChevronRight size={15}/></button></div><strong>{metricFormat(selected.value,metric)}<small>{METRIC_UNIT[metric]}</small></strong></div><div className="w3-mh-comparison"><span>{days}-Tage-Ø</span><b aria-label="Durchschnitt im Zeitraum">{metricFormat(summary.mean,metric)} <small>{METRIC_UNIT[metric]}</small></b>{change!=null&&<span>{change<0?<ArrowDownRight size={14}/>:<ArrowUpRight size={14}/>} {differenceFormat(change,metric)}</span>}<small>{change!=null?`ggü. vorherigen ${days} Tagen`:`${summary.count} Messungen`}</small></div></div>
        <HistoryChart points={points} metric={metric} index={index} onSelect={setIndex} average={summary.mean}/>
        <div className="w3-mh-coverage">{seen} von {days} {metric==='hrv'?'Nächten mit Nachtmittel':'Tagen erfasst'}{last&&last.date!==endDate?` · Letzter Wert ${dateLabel(last.date)}`:''}</div>
        {metric==='sleep'&&selected.row?.sleep_detail&&<SleepComposition point={selected}/>}
        <div className="w3-mh-bottom">
          <nav aria-label="Hintergrund">{([['insight','Einordnung'],['action','Für heute'],['explain','Verstehen'],['peers','Vergleich']] as const).map(([key,label])=><button key={key} aria-pressed={panel===key} onClick={()=>setPanel(key)}>{label}</button>)}</nav>
          <div className="w3-mh-note" role="region" aria-label="Details zum Messwert">
            {panel==='insight'?<><h3>{selected.value==null?'Dieser Tag ist offen':summary.mean==null?'Deine Basis entsteht':`${differenceFormat(selected.value!-summary.mean,metric)} zum ${days}-Tage-Ø`}</h3><p>{selected.value==null?'Keine Messung erfasst. Wähle einen anderen Tag im Verlauf.':`${summary.count} Messungen vom ${dateLabel(points[0].date)} bis ${dateLabel(endDate)} Dein persönlicher Verlauf ist die wichtigste Referenz.`}</p></>:panel==='peers'?<><h3>{metric==='sleep'?'Orientierung für Erwachsene':'Noch kein fairer Gruppenvergleich'}</h3><p>{metric==='sleep'?'Ab 7 Stunden regelmäßig · allgemeine Empfehlung für 18–60-Jährige. Kein Bevölkerungsrang oder persönliches Optimum.':'Für deine Messmethode, Altersgruppe und dein Trainingsniveau fehlt eine passende Referenz. Dein Verlauf bleibt der belastbare Vergleich.'}</p>{metric==='sleep'&&<a href="https://www.aasm.org/resources/pdf/adultsleepdurationconsensus.pdf" target="_blank" rel="noreferrer">Empfehlung · AASM / SRS ↗</a>}</>:panel==='action'?<><h3>{action?'Dein Tagesplan':'Dein nächster Schritt'}</h3><p>{action??(metric==='sleep'?'Halte deine Schlafzeiten möglichst regelmäßig. Betrachte die Tagesbelastung zusammen mit deinen übrigen Erholungssignalen.':'Beobachte mehrere Tage zusammen. Richte dein Training an der gesamten Bereitschaft aus, nicht an einem Einzelwert.')}</p></>:<><h3>{METRIC_LABEL[metric]} verstehen</h3><p>{EXPLANATION[metric]}</p>{metric==='hrv'&&<a href="https://www.garmin.com/en-US/garmin-technology/health-science/hrv-status/" target="_blank" rel="noreferrer">Hintergrund · Garmin ↗</a>}{metric==='sleep'&&<a href="https://www.cdc.gov/sleep/about/index.html" target="_blank" rel="noreferrer">Schlaf & Erholung · CDC ↗</a>}</>}
          </div>
        </div>
      </>}
    </motion.section>
  </dialog>,document.body)
}

function SleepComposition({point}:{point:HistoryDay}) {
  const sleep=point.row?.sleep_detail
  if(!sleep?.total_s) return null
  const stages=[{name:'Tief',value:sleep.deep_s,color:T.acid},{name:'REM',value:sleep.rem_s,color:T.ink},{name:'Leicht',value:sleep.light_s,color:T.mid}]
  const known=stages.filter(s=>s.value!=null&&s.value>=0)
  const sum=known.reduce((total,s)=>total+s.value!,0)
  if(!known.length||sum>sleep.total_s*1.05) return null
  return <div className="w3-mh-sleep" aria-label="Schlafphasen"><div className="w3-mh-sleep-bar">{known.map(s=><span key={s.name} style={{width:`${s.value!/Math.max(sum,sleep.total_s!)*100}%`,background:s.color}}/>)}</div><div>{known.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name}<b>{metricFormat(s.value!/3600,'sleep')} h</b></span>)}{point.row?.sleep_score!=null&&<span>Score<b>{point.row.sleep_score}/100</b></span>}</div></div>
}

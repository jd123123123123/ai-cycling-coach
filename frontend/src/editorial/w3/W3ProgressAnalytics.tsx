import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchProgressExplorer, type ProgressExplorer, type ProgressPeriod, type ProgressMetric, type ProgressRecord } from '../../api/progressExplorer'
import { T, FONT } from './w3tokens'
import './w3progressAnalytics.css'

const PERIODS: [ProgressPeriod,string][]=[['week','Woche'],['month','Monat'],['year','Jahr'],['plan','Seit Plan']]
const n=(v:number|null,d=1)=>v==null?'—':v.toLocaleString('de-DE',{maximumFractionDigits:d})
const dateLabel=(v:string)=>new Date(`${v.slice(0,10)}T12:00:00`).toLocaleDateString('de-DE',{day:'numeric',month:'short'})
const stamp=(v:string)=>Date.parse(`${v.slice(0,10)}T00:00:00Z`)
const dur=(s:number)=>s<60?`${s} s`:`${s/60} min`
export const PROGRESS_KEY=['analytics','progress-explorer'] as const
export function useProgressExplorer(period:ProgressPeriod='month', referenceDate?:string|null) {
 return useQuery({queryKey:referenceDate?[...PROGRESS_KEY,period,referenceDate]:[...PROGRESS_KEY,period],queryFn:()=>fetchProgressExplorer(period,referenceDate),staleTime:60_000,retry:1})
}

const iso=(d:Date)=>d.toISOString().slice(0,10)
export function calendarPeriodStart(period:ProgressPeriod, value:string) {
 const d=new Date(stamp(value))
 if(period==='year') d.setUTCMonth(0,1)
 if(period==='month') d.setUTCDate(1)
 if(period==='week') d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7)
 return iso(d)
}
export function shiftCalendarPeriod(period:ProgressPeriod, value:string, amount:number) {
 const d=new Date(stamp(calendarPeriodStart(period,value)))
 if(period==='year') d.setUTCFullYear(d.getUTCFullYear()+amount)
 if(period==='month') d.setUTCMonth(d.getUTCMonth()+amount)
 if(period==='week') d.setUTCDate(d.getUTCDate()+7*amount)
 return iso(d)
}
function periodCaption(period:ProgressPeriod,value:string) {
 const d=new Date(stamp(value))
 if(period==='year')return String(d.getUTCFullYear())
 if(period==='month')return d.toLocaleDateString('de-DE',{month:'short',year:'numeric',timeZone:'UTC'})
 const end=new Date(stamp(value)+6*86400000)
 return `${d.toLocaleDateString('de-DE',{day:'numeric',month:'short',timeZone:'UTC'})}–${end.toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'2-digit',timeZone:'UTC'})}`
}
export function ProgressCalendarSelector({period,today,referenceDate,onSelect}:{period:ProgressPeriod;today:string;referenceDate?:string|null;onSelect:(value:string)=>void}) {
 const rail=useRef<HTMLDivElement>(null)
 const gesture=useRef({armed:false,down:false,start:0,moved:false})
 const settleTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const selected=calendarPeriodStart(period,referenceDate??today)
 const current=calendarPeriodStart(period,today)
 const options=Array.from({length:9},(_,i)=>shiftCalendarPeriod(period,selected,i-4)).filter(value=>value>='1970-01-01'&&value<=current)
 const clearGesture=()=>{gesture.current.armed=false;if(settleTimer.current)clearTimeout(settleTimer.current)}
 const choose=(value:string)=>{clearGesture();onSelect(value)}
 const settle=()=>{
  const el=rail.current,g=gesture.current
  if(!el||!g.armed||!g.moved||g.down)return
  // Ignore programmatic centering. Only a completed user scroll can select.
  const rect=el.getBoundingClientRect(),center=rect.left+rect.width/2
  const candidates=Array.from(el.querySelectorAll<HTMLButtonElement>('[data-calendar-date]'))
  const closest=candidates.reduce<HTMLButtonElement|null>((best,item)=>{
   const r=item.getBoundingClientRect(),distance=Math.abs(r.left+r.width/2-center)
   if(!best)return item
   const br=best.getBoundingClientRect()
   return distance<Math.abs(br.left+br.width/2-center)?item:best
  },null)
  clearGesture()
  const value=closest?.dataset.calendarDate
  if(value&&value!==selected)onSelect(value)
 }
 const scheduleSettle=()=>{if(settleTimer.current)clearTimeout(settleTimer.current);settleTimer.current=setTimeout(settle,180)}
 const beginGesture=(down:boolean)=>{clearGesture();gesture.current={armed:true,down,start:rail.current?.scrollLeft??0,moved:false}}
 const endGesture=()=>{gesture.current.down=false;scheduleSettle()}
 useEffect(()=>{
  clearGesture()
  rail.current?.querySelector<HTMLElement>('[aria-pressed=true]')?.scrollIntoView?.({block:'nearest',inline:'center',behavior:'instant'})
  return clearGesture
 },[selected,period])

 const previous=shiftCalendarPeriod(period,selected,-1),next=shiftCalendarPeriod(period,selected,1)
 return <div className="w3-progress-calendar">
  <button type="button" className="w3-calendar-arrow" aria-label="Vorheriger Kalenderzeitraum" disabled={previous<'1970-01-01'} onClick={()=>choose(previous)}><ChevronLeft size={17}/></button>
  <div ref={rail} className="w3-calendar-rail" style={{'--calendar-item-width':period==='week'?'146px':period==='month'?'100px':'64px'} as CSSProperties} aria-label="Kalenderzeitraum auswählen"
   onPointerDown={()=>beginGesture(true)} onPointerUp={endGesture} onPointerCancel={e=>{if(e.pointerType!=='touch')endGesture()}}
   onTouchStart={()=>beginGesture(true)} onTouchEnd={endGesture} onTouchCancel={endGesture}
   onWheel={e=>{if((e.deltaX||e.shiftKey)&&!gesture.current.armed)beginGesture(false)}}
   onScroll={()=>{const g=gesture.current;if(g.armed&&Math.abs((rail.current?.scrollLeft??0)-g.start)>3)g.moved=true;if(g.armed)scheduleSettle()}}
   onKeyDown={e=>{if(e.key==='ArrowLeft'&&previous>='1970-01-01'){e.preventDefault();choose(previous)}else if(e.key==='ArrowRight'&&next<=current){e.preventDefault();choose(next)}}}>{options.map(value=><button type="button" key={value} data-calendar-date={value} aria-pressed={selected===value} onClick={()=>choose(value)}>{periodCaption(period,value)}</button>)}</div>
  <button type="button" className="w3-calendar-arrow" aria-label="Nächster Kalenderzeitraum" disabled={next>current} onClick={()=>choose(next)}><ChevronRight size={17}/></button>
 </div>
}

export function ProgressTrend({metric,start,end,kind}:{metric:ProgressMetric;start:string;end:string;kind:'ftp'|'vo2'}) {
 const [selected,setSelected]=useState<number|null>(null)
 const id=useId()
 const points=metric.points
 const index=selected==null?points.length-1:Math.min(selected,points.length-1)
 const picked=points[index]
 const baseline=metric.baseline??points[0]
 const latest=points.at(-1)
 const delta=latest&&baseline&&(metric.baseline||points.length>1)?latest.value-baseline.value:null
 const values=points.map(p=>p.value)
 const minimumSpan=kind==='ftp'?20:4
 const center=values.length?(Math.min(...values)+Math.max(...values))/2:0
 const span=Math.max(minimumSpan,values.length?Math.max(...values)-Math.min(...values):0)*1.25
 const lo=Math.floor(center-span/2),hi=Math.ceil(center+span/2)
 const x=(date:string)=>32+(stamp(date)-stamp(start))/Math.max(86400000,stamp(end)-stamp(start))*266
 const y=(value:number)=>140-(value-lo)/(hi-lo)*112
 const path=points.map((p,i)=>`${i?'L':'M'}${x(p.date)},${y(p.value)}`).join(' ')
 const positive=delta!=null&&delta>0
 const onPointer=(clientX:number,rect:DOMRect)=>{
   if(!points.length)return
   const at=(clientX-rect.left)/rect.width*320
   setSelected(points.reduce((best,p,i)=>Math.abs(x(p.date)-at)<Math.abs(x(points[best].date)-at)?i:best,0))
 }
 return <div className="w3-progress-trend">
   <div className="w3-progress-reading"><div><span>{kind==='ftp'?'Schwellenleistung':'VO₂max · Geräteschätzung'}</span><strong>{n(picked?.value??metric.current)}<small>{kind==='ftp'?'W':'ml/kg/min'}</small></strong><span>{picked?`${kind==='vo2'?'Stand ':''}${dateLabel(picked.date)} · ${picked.source==='manual'?'manuell gesetzt':picked.source}`:'Letzter bekannter Wert · keine Messung im Zeitraum'}</span></div>
   {delta!=null&&<div className="w3-progress-delta" style={{color:positive?T.acid:delta<0?T.warn:T.mid}}><strong>{delta>0?'+':''}{n(delta)}</strong><span>{metric.baseline?`seit ${dateLabel(metric.baseline.date)}`:'erster → letzter Wert'}</span></div>}</div>
   {points.length>0?<>
     <svg viewBox="0 0 320 170" role="img" aria-label={`${kind==='ftp'?'FTP':'VO₂max'} Verlauf, ${points.length} Datenpunkte vom ${start} bis ${end}`} onPointerMove={e=>onPointer(e.clientX,e.currentTarget.getBoundingClientRect())} onPointerDown={e=>onPointer(e.clientX,e.currentTarget.getBoundingClientRect())}>
       <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={T.acid} stopOpacity=".14"/><stop offset="1" stopColor={T.acid} stopOpacity="0"/></linearGradient></defs>
       {[lo,(lo+hi)/2,hi].map(v=><g key={v}><line x1="32" y1={y(v)} x2="302" y2={y(v)} stroke={T.rule}/><text x="24" y={y(v)+3} textAnchor="end" fill={T.mid} fontSize="9">{n(v,0)}</text></g>)}
       {points.length>1&&<><path d={`${path} L${x(points.at(-1)!.date)},148 L${x(points[0].date)},148 Z`} fill={`url(#${id})`}/><path d={path} fill="none" stroke={T.acid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></>}
       {points.map((p,i)=><circle key={`${p.date}-${i}`} cx={x(p.date)} cy={y(p.value)} r={i===index?4.5:2.4} fill={i===index?T.acid:T.surface} stroke={T.acid} strokeWidth="1.5"/>)}
       {picked&&<line x1={x(picked.date)} x2={x(picked.date)} y1="20" y2="148" stroke={T.mid} strokeDasharray="2 4" strokeOpacity=".5"/>}
       <text x="32" y="166" fill={T.mid} fontSize="9">{dateLabel(start)}</text><text x="302" y="166" textAnchor="end" fill={T.mid} fontSize="9">{dateLabel(end)}</text>
     </svg>
     {points.length>1&&<input className="w3-progress-scrubber" type="range" aria-label={kind==='vo2'?'Gespeicherten Stand auswählen':'Messung auswählen'} min="0" max={points.length-1} value={Math.max(0,index)} onChange={e=>setSelected(Number(e.target.value))} aria-valuetext={picked?`${dateLabel(picked.date)}: ${n(picked.value)}`:undefined}/>}
   </>:<div className="w3-progress-empty">Noch keine Messung in diesem Zeitraum. Wähle einen längeren Zeitraum, um deinen Verlauf zu sehen.</div>}
   {kind==='ftp'&&metric.target!=null&&metric.current!=null&&<div className="w3-progress-goal"><div><span>{metric.current>=metric.target?'Dein Ziel erreicht':`Noch ${n(metric.target-metric.current)} W`}</span><strong>Ziel {n(metric.target)} W</strong></div><div role="progressbar" aria-label="FTP-Ziel" aria-valuenow={Math.round(metric.current)} aria-valuemin={0} aria-valuemax={Math.max(metric.target,metric.current)}><i style={{width:`${Math.min(100,metric.current/metric.target*100)}%`}}/></div></div>}
   <details className="w3-progress-method"><summary>Einordnung</summary><p>{kind==='ftp'?'Die Kurve verbindet gespeicherte FTP-Einträge. Zwischen Messungen wird keine neue FTP berechnet. Ein manuell geänderter Wert allein beweist noch keinen Leistungszuwachs.':'VO₂max-Werte sind gespeicherte Geräteschätzungen. Das Datum bezeichnet den gespeicherten Stand und kann eine frühere Schätzung wiederholen. Einzelne Schwankungen sind kein sicherer Fitnessverlust oder -gewinn.'} {metric.baseline?`Vergleichswert: ${n(metric.baseline.value)} vom ${dateLabel(metric.baseline.date)}.`:''}</p></details>
 </div>
}

export function ProgressRecords({records,onRide,start,end}:{records:ProgressRecord[];onRide?:(id:number)=>void;start?:string;end?:string}) {
 const [seconds,setSeconds]=useState(300)
 const selected=records.find(p=>p.seconds===seconds)??records[0]
 const activeSeconds=selected?.seconds??seconds
 const max=Math.max(100,...records.flatMap(p=>[p.all_time_watts??0,p.watts??0,p.previous_watts??0]))
 const x=(s:number)=>32+Math.log(s/5)/Math.log(3600/5)*266
 const y=(v:number)=>232-v/max*132
 const makePath=(key:'watts'|'all_time_watts'|'previous_watts')=>{let gap=true;return records.map(p=>{if(p[key]==null){gap=true;return ''}const segment=`${gap?'M':'L'}${x(p.seconds)},${y(p[key]!)}`;gap=false;return segment}).join(' ')}
 const gap=selected?.watts!=null&&selected.all_time_watts!=null?selected.all_time_watts-selected.watts:null
 const change=selected?.watts!=null&&selected.previous_watts!=null?selected.watts-selected.previous_watts:null
 const percent=change!=null&&selected?.previous_watts?change/selected.previous_watts*100:null
 const signed=(v:number)=>`${v>0?'+':v<0?'−':''}${n(Math.abs(v))}`
 const differenceTint=change!=null&&change>0?T.acid:change!=null&&change<0?T.warn:T.mid
 const range=start&&end?`${dateLabel(start)} – ${dateLabel(end)}`:null
 const span=start&&end?stamp(end)-stamp(start)+86400000:null
 const previousRange=start&&span?`${dateLabel(new Date(stamp(start)-span).toISOString())} – ${dateLabel(new Date(stamp(start)-86400000).toISOString())}`:null
 const inspect=(clientX:number,clientY:number,rect:DOMRect)=>{
   if((clientY-rect.top)/rect.height*264<92||!records.length)return
   const at=(clientX-rect.left)/rect.width*320
   setSeconds(records.reduce((best,p)=>Math.abs(x(p.seconds)-at)<Math.abs(x(best.seconds)-at)?p:best).seconds)
 }
 return <div className="w3-progress-records">
   <div className="w3-record-comparison-heading"><strong>{selected?dur(selected.seconds):'Deine'} Leistung</strong><span style={{color:gap===0?T.acid:T.mid}}>{gap==null?'':gap===0?'Bestwert erreicht':`−${n(gap,0)} W zum Bestwert`}</span></div>
   <svg className="w3-record-comparison" viewBox="0 0 320 264" onPointerMove={e=>inspect(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect())} onPointerDown={e=>inspect(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect())} role="img" aria-label={`Leistungskurve für ${dur(activeSeconds)}: Vorher ${n(selected?.previous_watts??null,0)} W, Jetzt ${n(selected?.watts??null,0)} W${change==null?'':`, Veränderung ${signed(change)} W`}. Vorher ist der gleich lange Zeitraum davor. Logarithmische Dauerachse.`}>
     <text x="8" y="16" fill={T.mid} fontSize="11" fontWeight="600">Vorher</text>
     <text x="8" y="48" fill={T.ink} fontSize="29" fontWeight="600" letterSpacing="-1">{n(selected?.previous_watts??null,0)}<tspan fontSize="11" fill={T.mid} letterSpacing="0"> W</tspan></text>
     <text x="8" y="66" fill={T.mid} fontSize="9">{previousRange??'Vorheriger Zeitraum'}</text>
     <text x="312" y="16" textAnchor="end" fill={T.acid} fontSize="11" fontWeight="600">Jetzt</text>
     <text x="312" y="48" textAnchor="end" fill={T.acid} fontSize="29" fontWeight="600" letterSpacing="-1">{n(selected?.watts??null,0)}<tspan fontSize="11" fill={T.mid} letterSpacing="0"> W</tspan></text>
     <text x="312" y="66" textAnchor="end" fill={T.mid} fontSize="9">{range??'Gewählter Zeitraum'}</text>
     {change!=null&&<g><text x="160" y="36" textAnchor="middle" fill={differenceTint} fontSize="15" fontWeight="650">{signed(change)} W</text>{percent!=null&&<text x="160" y="53" textAnchor="middle" fill={T.mid} fontSize="10">{signed(percent)} %</text>}</g>}
     <line x1="8" x2="312" y1="82" y2="82" stroke={T.rule}/>
     {[0,max/2,max].map(v=><g key={v}><line x1="32" x2="302" y1={y(v)} y2={y(v)} stroke={T.rule}/><text x="25" y={y(v)+3} textAnchor="end" fill={T.mid} fontSize="9">{n(v,0)}</text></g>)}
     {records.slice(1).map((p,i)=>{const prev=records[i];return p.watts!=null&&p.previous_watts!=null&&prev.watts!=null&&prev.previous_watts!=null?<path key={p.seconds} d={`M${x(prev.seconds)},${y(prev.watts)} L${x(p.seconds)},${y(p.watts)} L${x(p.seconds)},${y(p.previous_watts)} L${x(prev.seconds)},${y(prev.previous_watts)} Z`} fill={T.acid} opacity=".07"/>:null})}
     <path d={makePath('all_time_watts')} stroke={T.mid} strokeWidth="1" strokeDasharray="1 5" opacity=".25" fill="none"/>
     <path d={makePath('previous_watts')} stroke={T.mid} strokeWidth="2" strokeDasharray="5 4" fill="none"/>
     <path d={makePath('watts')} stroke={T.acid} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
     {selected&&<line x1={x(activeSeconds)} x2={x(activeSeconds)} y1="92" y2="236" stroke={T.mid} strokeDasharray="2 4" opacity=".55"/>}
     {selected?.previous_watts!=null&&<circle cx={x(activeSeconds)} cy={y(selected.previous_watts)} r="4" fill={T.surface} stroke={T.mid} strokeWidth="2"/>}
     {selected?.watts!=null&&<><circle cx={x(activeSeconds)} cy={y(selected.watts)} r="8" fill={T.acid} opacity=".12"/><circle cx={x(activeSeconds)} cy={y(selected.watts)} r="4" fill={T.acid}/></>}
     {[5,60,300,3600].map(s=><text key={s} x={x(s)} y="258" textAnchor={s===5?'start':s===3600?'end':'middle'} fill={T.mid} fontSize="9">{dur(s)}</text>)}
   </svg>
   <div className="w3-progress-durations" aria-label="Rekorddauer">{records.map(p=><button type="button" key={p.seconds} aria-pressed={activeSeconds===p.seconds} onClick={()=>setSeconds(p.seconds)}>{dur(p.seconds)}</button>)}</div>
   {selected&&<div className="w3-progress-record-detail"><div><span>Bisheriger Bestwert</span><strong>{n(selected.all_time_watts,0)} W</strong></div>{selected.activity_id&&onRide&&<button onClick={()=>onRide(selected.activity_id!)}>Fahrt vom {selected.date?dateLabel(selected.date):'gewählten Tag'} <ArrowUpRight size={14}/></button>}</div>}
   <details className="w3-progress-method"><summary>Vergleich verstehen</summary><p>Vorher ist der gleich lange Zeitraum unmittelbar vor deiner Auswahl. Jetzt zeigt den Bestwert innerhalb deiner Auswahl. Grau gestrichelt: vorher. Grün durchgezogen: jetzt. Die dezente gepunktete Linie zeigt bisherige Bestwerte.</p><p>Verglichen wird die höchste mittlere Leistung über dieselbe Dauer. Fehlende Werte bleiben offen. Ein Zeitraum ohne harte Versuche sagt nichts über deine maximale Leistungsfähigkeit.</p></details>
 </div>
}

export function W3ProgressAnalyticsView({data,period,onPeriod,onGoal,onRide,referenceDate,onReferenceDate,today,pending=false,error=false}:{data?:ProgressExplorer;referenceDate?:string|null;onReferenceDate?:(value:string)=>void;today?:string;period:ProgressPeriod;onPeriod:(p:ProgressPeriod)=>void;onGoal?:()=>void;onRide?:(id:number)=>void;pending?:boolean;error?:boolean}) {
 const [mode,setMode]=useState<'ftp'|'vo2'|'records'>('ftp')
 const vars={'--pa-bg':T.surface,'--pa-ink':T.ink,'--pa-mid':T.mid,'--pa-rule':T.rule,'--pa-acid':T.acid,'--pa-button-ink':T.heroInk,'--pa-soft':T.surface2,fontFamily:FONT} as CSSProperties
 return <section className="w3-progress-analytics" style={vars} aria-label="Fortschrittsanalyse">
   <div className="w3-progress-periods" aria-label="Zeitraum">{PERIODS.map(([key,label])=><button type="button" key={key} aria-pressed={period===key} onClick={()=>onPeriod(key)}>{label}</button>)}</div>
   {period!=='plan'&&onReferenceDate&&<ProgressCalendarSelector period={period} today={today??data?.today??data?.end??iso(new Date())} referenceDate={referenceDate} onSelect={onReferenceDate}/>}
   <div className="w3-progress-modes" aria-label="Kennzahl">{([['ftp','FTP'],['vo2','VO₂max'],['records','Rekorde']] as const).map(([key,label])=><button key={key} type="button" aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</div>
   <div className="w3-progress-range">{data?.start?`${dateLabel(data.start)} – ${dateLabel(data.end)}`:period==='plan'?'Kein aktiver Plan':''}{onGoal&&<button onClick={onGoal}>Ziel setzen <ArrowUpRight size={12}/></button>}</div>
   {pending?<p className="w3-progress-empty" role="status">Verlauf wird geladen…</p>:error?<p className="w3-progress-empty" role="alert">Der Verlauf konnte nicht geladen werden. Öffne die Kachel erneut oder wähle einen anderen Zeitraum.</p>:data?.start?<>
     {mode==='records'?<ProgressRecords key={`${period}-${data.start}`} records={data.records} onRide={onRide} start={data.start} end={data.end}/>:<ProgressTrend key={`${mode}-${period}-${data.start}`} metric={data[mode]} start={data.start} end={data.end} kind={mode}/>}
     {period==='plan'&&<p className="w3-progress-plan-note">{data.plan_note}</p>}
   </>:<p className="w3-progress-empty">Sobald dein Plan startet, kannst du hier deinen Fortschritt seit Planbeginn verfolgen.</p>}
 </section>
}

export default function W3ProgressAnalytics() {
 const [period,setPeriod]=useState<ProgressPeriod>('month')
 const [referenceDate,setReferenceDate]=useState<string|null>(null)
 const {data,isPending,isError}=useProgressExplorer(period,referenceDate)
 const [athleteToday,setAthleteToday]=useState<string|undefined>()
 useEffect(()=>{if(data?.today)setAthleteToday(data.today)},[data?.today])
 const navigate=useNavigate()
 return <W3ProgressAnalyticsView data={data} period={period} today={data?.today??athleteToday} referenceDate={referenceDate} onReferenceDate={setReferenceDate} onPeriod={p=>{setPeriod(p);setReferenceDate(null)}} pending={isPending} error={isError} onGoal={()=>navigate('/e/w3-goal-set')} onRide={id=>navigate(`/e/w3-ride/${id}`)}/>
}

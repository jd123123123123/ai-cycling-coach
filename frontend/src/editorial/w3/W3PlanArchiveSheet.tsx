import {useEffect,useRef,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {ArrowLeft,ArrowUpRight,ChevronLeft,ChevronRight,Route,Clock3,Mountain,X} from 'lucide-react'
import {useNavigate} from 'react-router-dom'
import {fetchPlanHistory,fetchPlanHistoryDetail,refreshPlanHistory,type PlanHistoryItem,type PlanHistoryDetail} from '../../api/planHistory'
import {smoothCurve} from './w3SmoothCurve'
import {rideTime} from './W3PlanDayComparison'
import './w3PlanHistory.css'
const fmt=(n:number|null|undefined,digits=0)=>n==null?'—':n.toLocaleString('de-DE',{maximumFractionDigits:digits})
const date=(s:string)=>new Date(`${s}T12:00:00`).toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'2-digit'})
const status={completed:'Abgeschlossen',cancelled:'Beendet',replaced:'Plan gewechselt',active:'Aktuell'}
const delta=(item:PlanHistoryItem,key:'ftp'|'vo2')=>{const start=item.baseline[key]?.value,end=item.progress?.[key].current;return start!=null&&end!=null?end-start:null}
const signed=(n:number|null)=>n==null?'—':`${n>0?'+':n<0?'−':''}${fmt(Math.abs(n),1)}`

export default function W3PlanHistory({onClose,preview}:{onClose:()=>void;preview?:PlanHistoryDetail[]}) {
 const ref=useRef<HTMLDialogElement>(null),[selected,setSelected]=useState<string|null>(null),[offset,setOffset]=useState(0)
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[])
 const list=useQuery({queryKey:['plan-history',offset],queryFn:async()=>{if(offset===0)await refreshPlanHistory();return fetchPlanHistory(offset)},enabled:!preview,staleTime:30_000,retry:1})
 const detail=useQuery({queryKey:['plan-history-detail',selected],queryFn:()=>fetchPlanHistoryDetail(selected!),enabled:!!selected&&!preview,staleTime:300_000,retry:1})
 const items=preview?.slice(offset,offset+3)??list.data?.plans??[],next=preview?(offset+3<preview.length?offset+3:null):list.data?.next_offset??null
 const current=preview?.find(p=>p.id===selected)??detail.data
 return <dialog ref={ref} className="w3-plan-history" aria-label="Plan-Historie" onCancel={onClose}>
  <header><button aria-label={selected?'Zur Plan-Historie':'Schließen'} onClick={()=>selected?setSelected(null):onClose()}>{selected?<ArrowLeft size={20}/>:<X size={20}/>}</button><span>{selected?'Dein Rückblick':'Plan-Historie'}</span>{selected?<button aria-label="Schließen" onClick={onClose}><X size={20}/></button>:<i/>}</header>
  {selected?current?<HistoryDetail key={current.id} plan={current}/>:<div className="plan-history-empty"><p>{detail.isError?'Der Rückblick konnte nicht geladen werden.':'Dein Rückblick lädt …'}</p>{detail.isError&&<button onClick={()=>void detail.refetch()}>Erneut laden</button>}</div>:<>
   <div className="plan-history-heading"><h1>Dein Weg.<br/>Bleibt deiner.</h1><p>Frühere Pläne & deine Entwicklung.</p></div>
   <div className="plan-history-list">{items.map(item=><button className="plan-history-item" key={item.id} onClick={()=>setSelected(item.id)}><div><span>{date(item.start)} — {date(item.end??item.planned_end)}</span><small>{status[item.status]}</small></div><h2>{item.title}<ArrowUpRight size={20}/></h2><div className="plan-history-card-bottom"><span>{item.weeks} Wochen</span><span><b>{signed(delta(item,'ftp'))}</b> W FTP</span></div></button>)}
   {!items.length&&<div className="plan-history-empty"><h2>{!preview&&list.isPending?'Deine Pläne laden …':!preview&&list.isError?'Historie gerade nicht verfügbar':'Hier bleibt dein Fortschritt.'}</h2><p>{!preview&&list.isError?'Bitte versuche es erneut.':'Abgeschlossene und beendete Pläne erscheinen hier. Ältere, nicht gespeicherte Pläne lassen sich nicht rekonstruieren.'}</p>{list.isError&&<button onClick={()=>void list.refetch()}>Erneut laden</button>}</div>}</div>
   <footer><button disabled={offset===0} aria-label="Neuere Pläne" onClick={()=>setOffset(Math.max(0,offset-3))}><ChevronLeft size={20}/></button><span>{items.length?`${offset+1}–${offset+items.length}`:'Deine Pläne bleiben gespeichert'}</span><button disabled={next==null} aria-label="Ältere Pläne" onClick={()=>next!=null&&setOffset(next)}><ChevronRight size={20}/></button></footer>
  </>}
 </dialog>
}
function HistoryDetail({plan}:{plan:PlanHistoryDetail}) {
 const nav=useNavigate(),[tab,setTab]=useState<'progress'|'weeks'>('progress'),[metric,setMetric]=useState<'ftp'|'vo2'|'records'>('ftp'),[record,setRecord]=useState(300),[week,setWeek]=useState(0),[day,setDay]=useState(0)
 const progress=plan.progress,rec=progress?.records.find(r=>r.seconds===record)
 const data=metric==='records'?null:progress?.[metric]
 const start=metric==='records'?rec?.previous_watts:plan.baseline[metric]?.value,end=metric==='records'?rec?.watts:data?.current
 const diff=start!=null&&end!=null?end-start:null,unit=metric==='vo2'?'ml/kg/min':'W'
 const points=data?[...(data.baseline?[data.baseline]:[]),...data.points]:[]
 const low=points.length?Math.min(...points.map(p=>p.value))*.96:0,high=points.length?Math.max(...points.map(p=>p.value))*1.04:1
 const from=Date.parse(points[0]?.date??plan.start),until=Date.parse(plan.end??plan.planned_end)
 const line=smoothCurve(points.map(p=>({x:8+(Date.parse(p.date)-from)/Math.max(1,until-from)*304,y:86-(p.value-low)/Math.max(1,high-low)*72})))
 const weeks=plan.outcome?.weeks??[],selected=weeks[week],max=Math.max(1,...weeks.flatMap(w=>[w.planned_tss??0,w.actual_tss??0]))
 const days=plan.revisions.at(-1)?.schedule.days??[],dayDate=selected?new Date(`${selected.start}T12:00:00`):null
 dayDate?.setDate(dayDate.getDate()+day)
 const iso=dayDate?`${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,'0')}-${String(dayDate.getDate()).padStart(2,'0')}`:''
 const prescribed=days.filter(d=>d.date===iso),rides=plan.outcome?.rides.filter(r=>r.date===iso)??[]
 return <div className="plan-history-detail">
  <div className="plan-history-detail-title"><span>{status[plan.status]} · {date(plan.start)} — {date(plan.end??plan.planned_end)}</span><h1>{plan.title}</h1></div>
  <div className="plan-history-tabs" role="group" aria-label="Planrückblick"><button aria-pressed={tab==='progress'} onClick={()=>setTab('progress')}>Entwicklung</button><button aria-pressed={tab==='weeks'} onClick={()=>setTab('weeks')}>Trainingswochen</button></div>
  {tab==='progress'?<>
   <div className="plan-history-metrics" role="group" aria-label="Messwert im Rückblick">{(['ftp','vo2','records'] as const).map(k=><button key={k} aria-pressed={metric===k} onClick={()=>setMetric(k)}>{k==='ftp'?'FTP':k==='vo2'?'VO₂max':'Bestwerte'}</button>)}</div>
   <div className="plan-history-change"><strong>{signed(diff)}<small>{unit}</small></strong><span>{start==null?'Startwert fehlt':`${fmt(start,1)} → ${fmt(end,1)} ${unit}`}</span></div>
   <div className="plan-history-progress-graph">{metric==='records'?<>
    <div className="plan-history-record-beams" aria-label={`Vorher ${fmt(start)} W, im Plan ${fmt(end)} W`}><i style={{width:`${(start??0)/Math.max(1,start??0,end??0)*100}%`}}/><b style={{width:`${(end??0)/Math.max(1,start??0,end??0)*100}%`}}/></div>
    <div className="plan-history-record-select">{[1,5,10,15,30,60,120,300,600,1200].map(s=><button key={s} aria-pressed={record===s} onClick={()=>setRecord(s)}>{s<60?`${s}s`:`${s/60}m`}</button>)}</div>
   </>:points.length>1?<svg viewBox="0 0 320 102" role="img" aria-label={`${metric==='ftp'?'FTP':'VO₂max'} im gespeicherten Planzeitraum`}><path d="M8 94H312" className="workout-baseline"/><path d={line} fill="none" stroke="var(--plan-acid)" strokeWidth="2.5"/>{points.map((p,i)=><circle key={i} cx={8+(Date.parse(p.date)-from)/Math.max(1,until-from)*304} cy={86-(p.value-low)/Math.max(1,high-low)*72} r="3" fill="var(--plan-acid)"/>)}</svg>:<p>Für einen Verlauf fehlen datierte Messungen.</p>}</div>
   <div className="plan-history-totals">{[[Route,plan.totals?.km,'km'],[Clock3,plan.totals?.hours,'h'],[Mountain,plan.totals?.ascent,'hm']].map(([Icon,value,label])=>{const I=Icon as typeof Route;return <div key={String(label)}><I size={18}/><strong>{fmt(value as number|null, label==='h'?1:0)}</strong><span>{String(label)}</span></div>})}</div>
   <p className="plan-history-evidence">{metric==='records'?'Bestleistungen im Plan gegenüber dem gleich langen Zeitraum davor.':metric==='vo2'?'Garmin-Schätzung im Planzeitraum.':'Gespeicherte FTP-Messwerte im Planzeitraum.'} {plan.outcome?.note}</p>
  </>:<>
   <div className="plan-history-week-chart" role="group" aria-label="Gespeicherte Trainingswochen">{weeks.map((w,i)=><button key={w.start} aria-pressed={week===i} aria-label={`Woche ${i+1}: Ist ${fmt(w.actual_tss)}, Soll ${fmt(w.planned_tss)} TSS`} onClick={()=>{setWeek(i);setDay(0)}}><span>{w.planned_tss!=null&&<i style={{height:`${w.planned_tss/max*100}%`}}/>}{w.actual_tss!=null&&<b style={{height:`${w.actual_tss/max*100}%`}}/>}</span><small>{i+1}</small></button>)}</div>
   <div className="plan-history-week-readout"><span>Woche {week+1}</span><span>Ist <b>{fmt(selected?.actual_tss)}</b> / Soll {fmt(selected?.planned_tss)} TSS</span></div>
   <div className="plan-history-days">{['Mo','Di','Mi','Do','Fr','Sa','So'].map((d,i)=><button key={d} aria-pressed={day===i} onClick={()=>setDay(i)}>{d}</button>)}</div>
   <div className="plan-history-day"><span>Empfohlen</span>{prescribed.length?prescribed.map((d,i)=><div key={i}><h2>{d.title}</h2><p>{rideTime(d.duration)} · {fmt(d.tss)} TSS</p></div>):<p>Keine gespeicherte Empfehlung.</p>}<span>Gefahren</span>{rides.length?rides.map(r=><button key={r.id} onClick={()=>{if(r.id>0)nav(`/e/w3-ride/${r.id}`)}}><div><h2>{r.title}</h2><p>{rideTime(r.duration)} · {fmt(r.tss)} TSS</p></div><ArrowUpRight size={19}/></button>):<p>Keine Fahrt aufgezeichnet.</p>}</div>
  </>}
 </div>
}

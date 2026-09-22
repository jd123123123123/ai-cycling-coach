import { useState, type CSSProperties } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchRideChart } from '../../api/rideChart'
import type { PlanDaySession } from './W3PlanView'
import { beamAt, plannedPower, recordedPower, zoneTime, ZONE_NAMES, type DayPowerChart } from './planWorkoutComparison'

export function tssDifference(planned: number | null, actual: number | null) {
  if (planned == null || actual == null || !Number.isFinite(planned) || !Number.isFinite(actual)) return null
  const delta = Math.round(actual - planned)
  return delta === 0 ? 'Belastung wie geplant' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} TSS zum Plan`
}
export function rideTime(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h`
}

/** Fetch only this selected day's rides, reusing the ride-detail cache. */
function RecordedComparison({day, ids}:{day:PlanDaySession;ids:number[]}) {
  const results = useQueries({ queries: ids.map(id => ({ queryKey:['ride-chart',id], queryFn:()=>fetchRideChart(id), staleTime:300_000, retry:1 })) })
  const loading = results.some(r=>r.isPending), failed = results.some(r=>r.isError)
  return <DayComparison day={day} charts={!loading&&!failed ? results.flatMap(r=>r.data?[r.data]:[]) : []} loading={loading} failed={failed} onRetry={()=>results.forEach(r=>{if(r.isError)void r.refetch()})}/>
}
export default function W3PlanDayComparison({day}:{day:PlanDaySession}) {
  const ids=[...new Set(day.actualRides?.map(r=>r.id)??[])]
  if (day.powerCharts) return <DayComparison day={day} charts={day.powerCharts}/>
  if ((day.isPast||day.ridden)&&ids.length) return <RecordedComparison key={day.dateISO} day={day} ids={ids}/>
  return <DayComparison day={day} charts={[]}/>
}

function DayComparison({day,charts,loading=false,failed=false,onRetry}:{day:PlanDaySession;charts:DayPowerChart[];loading?:boolean;failed?:boolean;onRetry?:()=>void}) {
  const [view,setView]=useState<'profile'|'zones'>('profile'), [at,setAt]=useState<number|null>(null), [zone,setZone]=useState<number|null>(null), [fact,setFact]=useState<string|null>(null)
  const planned=plannedPower(day), recorded=recordedPower(charts), past=day.isPast||!!day.ridden
  const tss=day.title ? Number.isFinite(Number(day.tss))?Number(day.tss):null : 0
  const actualTss=day.actualTss??null, duration=day.title?day.plannedDuration??null:0
  const hasRide=day.ridden||actualTss!=null||day.actualDuration!=null
  const missing=day.actualKnown===false&&past?'Daten fehlen':past&&!hasRide?'Keine Fahrt aufgezeichnet':past&&actualTss==null?'TSS nicht erfasst':null
  const haveActual=recorded.beams.some(b=>b.ratio!=null), havePlan=planned.beams.some(b=>b.ratio!=null)
  const total=Math.max(1,planned.duration,recorded.duration,day.actualDuration??0)
  const maxPower=Math.max(1.3,...planned.beams.map(b=>b.ratio??0),...recorded.beams.map(b=>b.ratio??0))*1.08
  const x=(s:number)=>s/total*320, y=(ratio:number)=>78-ratio/maxPower*72
  const distribution=planned.zones??recorded.zones??[1,0,0,0,0,0,0]
  const suggested=distribution.slice(1).some(v=>v>0)?distribution.reduce((best,value,i,all)=>i>0&&value>all[best]?i:best,1):0
  const selectedZone=zone??suggested
  const maxZone=Math.max(60,...(planned.zones??[]),...(recorded.zones??[]))
  const zY=(s:number)=>76-s/maxZone*62
  const pAt=at==null?null:beamAt(planned.beams,at), aAt=at==null?null:beamAt(recorded.beams,at)
  const pct=(n:number|null)=>n==null?'—':`${Math.round(n*100)}%`
  const status=missing??(loading?'Leistung wird geladen …':failed?'Leistung nicht geladen':past&&hasRide&&!haveActual?'Keine Leistungsaufzeichnung':recorded.partial&&haveActual?'Leistung teilweise erfasst':!havePlan&&day.title?'Soll-Profil nicht gespeichert':charts.length>1?`${charts.length} Fahrten · nacheinander`:null)
  const totalMin=(s:number)=>String(Math.round(s/60))
  const chooseView=(next:'profile'|'zones')=>{setView(next);setAt(null);setFact(null)}
  return <div className="focus-workout-comparison" aria-label={past?'Ist und Soll im Vergleich':'Empfohlenes Trainingsprofil'} aria-busy={loading}>
    <div className="focus-workout-toolbar">
      <div className="focus-workout-legend">{past&&<span><i data-actual/>Ist</span>}<span><i/>Soll</span></div>
      <div className="focus-workout-tabs" role="group" aria-label="Darstellung des Trainings"><button type="button" aria-pressed={view==='profile'} onClick={()=>chooseView('profile')}>Verlauf</button><button type="button" aria-pressed={view==='zones'} onClick={()=>chooseView('zones')}>Zonen</button></div>
    </div>
    {view==='profile'?<div className="focus-workout-plot">
      <svg viewBox="0 0 320 101" preserveAspectRatio="none" role="img" aria-label="Trainingsverlauf: Soll als Kontur, Ist als Balken. Gemeinsame Zeitachse und Leistung relativ zur FTP.">
        <path d="M0 78H320" className="workout-baseline"/>
        {(havePlan||haveActual)&&<><path d={`M0 ${y(1)}H320`} className="workout-ftp"/><text x="320" y={y(1)-5} textAnchor="end" className="workout-axis">100% FTP</text></>}
        {planned.beams.map((b,i)=>b.ratio==null?null:<rect key={i} className="workout-target" x={x(b.start)+.7} y={y(b.ratio)} width={Math.max(.5,x(b.end-b.start)-1.4)} height={Math.max(1,78-y(b.ratio))} rx="2"/>)}
        {recorded.beams.map((b,i)=>b.ratio==null?null:<rect key={i} className="workout-actual" x={x(b.start)+.65} y={y(b.ratio)} width={Math.max(.5,x(b.end-b.start)-1.3)} height={Math.max(1,78-y(b.ratio))} rx="1.4"/>)}
        {recorded.boundaries.map(s=><path key={s} className="workout-ftp" d={`M${x(s)} 3V78`}/>)}
        {at!=null&&<path d={`M${x(at)} 3V78`} className="workout-cursor"/>}
        <text x="0" y="98" className="workout-axis">0</text><text x="160" y="98" textAnchor="middle" className="workout-axis">{totalMin(total/2)}</text><text x="320" y="98" textAnchor="end" className="workout-axis">{totalMin(total)} min</text>
      </svg>
      {(havePlan||haveActual)&&<input className="focus-workout-scrub" type="range" min="0" max={Math.max(0,Math.floor(total)-1)} step="1" value={at??0} aria-label="Zeit im Trainingsprofil" aria-valuetext={`${rideTime(at??0)}, Ist ${pct(beamAt(recorded.beams,at??0))}, Soll ${pct(beamAt(planned.beams,at??0))} FTP`} onChange={e=>setAt(Number(e.target.value))} onBlur={()=>setAt(null)}/>}
      {!havePlan&&!haveActual&&<div className="focus-workout-empty">{loading?'Leistung wird geladen …':day.title?'Kein Leistungsprofil verfügbar':'Kein Training geplant'}</div>}
    </div>:<div className="focus-workout-plot focus-workout-zones">
      <svg viewBox="0 0 320 101" preserveAspectRatio="none" role="img" aria-label="Minuten je Leistungszone. Kontur: empfohlen. Füllung: gefahren. Alle Zonen mit derselben Minutenskala.">
        <path d="M0 78H320" className="workout-baseline"/>
        {ZONE_NAMES.map((_,i)=>{
          const center=(i+.5)/7*320,p=planned.zones?.[i],a=recorded.zones?.[i]
          return <g key={i} opacity={selectedZone===i?1:.58}>
            {p!=null&&<rect className="workout-target" x={center-15} y={zY(p)} width="30" height={Math.max(1,78-zY(p))} rx="3"/>}
            {a!=null&&<rect className="workout-actual" x={center-9} y={zY(a)} width="18" height={Math.max(1,78-zY(a))} rx="2"/>}
            <text x={center} y={zY(Math.max(p??0,a??0))-5} textAnchor="middle" className="workout-zone-minutes">{zoneTime(past?a:p)}</text>
          </g>
        })}
      </svg>
      <div className="focus-workout-zone-buttons">{ZONE_NAMES.map((name,i)=><button type="button" key={name} aria-pressed={selectedZone===i} aria-label={`Z${i+1} ${name}: ${past?`Ist ${zoneTime(recorded.zones?.[i])}, `:''}Soll ${zoneTime(planned.zones?.[i])}`} onClick={()=>setZone(i)}>Z{i+1}</button>)}</div>
    </div>}
    {(at!=null||view==='zones'||status)&&<div className="focus-workout-caption" aria-live="polite">
      {at!=null?<><span>{rideTime(at)}</span><span>{past&&<>Ist <b>{pct(aAt)}</b> <i/> </>}Soll <b>{pct(pAt)}</b> FTP</span></>:view==='zones'?<><span>{ZONE_NAMES[selectedZone]}</span><span>{past&&<>Ist <b>{zoneTime(recorded.zones?.[selectedZone])}</b> <i/> </>}Soll <b>{zoneTime(planned.zones?.[selectedZone])}</b></span></>:<><span>{status??'Leistung · % FTP'}</span>{failed?<button onClick={onRetry}>Erneut laden</button>:<span>{haveActual?'↔':''}</span>}</>}
    </div>}
    <div className="focus-workout-facts" style={{'--fact-count':past?2:3} as CSSProperties}>
      <Fact label="Dauer" actual={day.actualDuration??null} planned={duration} past={past} format={rideTime} onClick={()=>setFact(fact==='time'?null:'time')}/>
      {!past&&<div><strong>{day.targetW}</strong><span>{day.ftpPct} FTP</span></div>}
      <Fact label="TSS" actual={actualTss} planned={tss} past={past} format={n=>n==null?'—':String(Math.round(n))} onClick={()=>setFact(fact==='tss'?null:'tss')}/>
    </div>
    {fact&&<p className="focus-workout-note">{fact==='tss'?(tssDifference(tss,actualTss)??'TSS-Vergleich nicht verfügbar'):fact==='time'?(duration!=null&&day.actualDuration!=null?`${day.actualDuration>=duration?'+':'−'}${rideTime(Math.abs(day.actualDuration-duration))} zum Plan`:'Zeitvergleich nicht verfügbar'):missing}</p>}
  </div>
}
function Fact({label,actual,planned,past,format,onClick}:{label:string;actual:number|null;planned:number|null;past:boolean;format:(n:number|null)=>string;onClick:()=>void}) {
  if(!past)return <div><strong>{format(planned)}</strong><span>{label}</span></div>
  const scale=Math.max(1,actual??0,planned??0)
  return <button type="button" onClick={onClick} aria-label={`${label}: Ist ${format(actual)}, Soll ${format(planned)}. Differenz anzeigen.`}><div><strong>{format(actual)}</strong><small>{format(planned)}</small></div><span className="focus-fact-beam" aria-hidden><i style={{width:`${(planned??0)/scale*100}%`}}/><b style={{width:`${(actual??0)/scale*100}%`}}/></span><span>{label}</span></button>
}

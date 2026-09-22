import { useState } from 'react'
import type { PlanDaySession } from './W3PlanView'

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

export function comparisonPositions(planned: number | null, actual: number | null) {
  const valid = (v: number | null) => v != null && Number.isFinite(v) && v >= 0 ? v : null
  const target=valid(planned), value=valid(actual), max=Math.max(1,target??0,value??0)
  const position=(v:number|null)=>v==null?null:66+v/max*228
  return { planned:position(target), actual:position(value) }
}

function ComparisonLane({label,planned,actual,format,unit}:{label:string;planned:number|null;actual:number|null;format:(n:number|null)=>string;unit:string}) {
  const [open,setOpen]=useState(false)
  const pos=comparisonPositions(planned,actual)
  const delta=planned!=null&&actual!=null?Math.round(actual-planned):null
  const difference=delta==null?'Vergleich nicht verfügbar':`${delta>0?'+':delta<0?'−':''}${Math.abs(delta)} ${unit}`
  const anchor=(x:number)=>x>264?'end':x<90?'start':'middle'
  return <button type="button" className="focus-compare-lane" aria-expanded={open} aria-label={`${label}: Ist ${format(actual)}, Soll ${format(planned)}. Differenz anzeigen.`} onClick={()=>setOpen(!open)}>
    <svg viewBox="0 0 310 61" role="img" aria-label={`${label}: Ist ${format(actual)}, Soll ${format(planned)}`}>
      <text x="0" y="34" className="focus-compare-label">{label}</text>
      <path d="M66 30H294" className="focus-compare-track"/>
      {pos.actual!=null&&<path d={`M66 30H${pos.actual}`} className="focus-compare-fill"/>}
      {pos.actual!=null&&pos.planned!=null&&<path d={`M${pos.actual} 30H${pos.planned}`} className="focus-compare-gap"/>}
      {pos.planned!=null&&<circle cx={pos.planned} cy="30" r="5.5" className="focus-compare-target"/>}
      {pos.actual!=null&&<circle cx={pos.actual} cy="30" r={pos.actual===pos.planned?2.5:4} className="focus-compare-dot"/>}
      <text x={pos.actual??66} y="15" textAnchor={anchor(pos.actual??66)} className="focus-compare-actual-value">{format(actual)}</text>
      <text x={pos.planned??294} y="54" textAnchor={anchor(pos.planned??294)} className="focus-compare-planned-value">{format(planned)}</text>
    </svg>
    {open&&<output className="focus-compare-delta">{difference}</output>}
  </button>
}

/** Same zero-based scale within each lane; load is not workout quality. */
export default function W3PlanDayComparison({ day }: { day: PlanDaySession }) {
  const planned = day.title ? Number.isFinite(Number(day.tss)) ? Number(day.tss) : null : 0
  const actual = day.actualTss ?? null
  const duration=day.title ? day.plannedDuration??null : 0
  const ridden=day.ridden||actual!=null||day.actualDuration!=null
  const state=day.actualKnown===false?'Daten fehlen':!ridden?'Keine Fahrt aufgezeichnet':actual==null?'TSS nicht erfasst':null
  return <div className="focus-day-comparison" aria-label="Ist und Soll im Vergleich">
    <div className="focus-comparison-legend"><span><i data-actual/>Ist</span><span><i/>Soll</span></div>
    <ComparisonLane key={`${day.dateISO}-tss`} label="TSS" planned={planned} actual={actual} format={n=>n==null?'—':String(Math.round(n))} unit="TSS"/>
    <ComparisonLane key={`${day.dateISO}-time`} label="Zeit" planned={duration==null?null:duration/60} actual={day.actualDuration==null?null:day.actualDuration/60} format={n=>rideTime(n==null?null:n*60)} unit="min"/>
    {state&&<p className="focus-comparison-missing">{state}</p>}
  </div>
}

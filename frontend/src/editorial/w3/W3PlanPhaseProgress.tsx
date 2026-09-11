import type { CSSProperties } from 'react'
import { T } from './w3tokens'

const LABELS:Record<string,string>={accumulation:'Aufbau',transmutation:'Intensiv',realization:'Form',recovery:'Erholung'}
export default function W3PlanPhaseProgress({schedule,index,fallback}:{schedule?:string[]|null;index?:number|null;fallback?:string|null}) {
 if(!schedule?.length || index==null || !Number.isInteger(index) || index<0 || index>=schedule.length) return <span className="w3-overview-plan-value">{fallback ?? 'Phase noch nicht verfügbar'}</span>
 // Count contiguous phases: a later return to Aufbau is a new phase, not
 // additional weeks in the current one.
 const groups:{phase:string;start:number;weeks:number}[]=[]
 schedule.forEach((phase,i)=>{
  const last=groups.at(-1)
  if(last?.phase===phase) last.weeks++
  else groups.push({phase,start:i,weeks:1})
 })
 const active=groups.find(group=>index>=group.start&&index<group.start+group.weeks)!
 const remaining=schedule.length-index-1
 return <>
  <div className="w3-phase-rail" style={{gridTemplateColumns:`repeat(${schedule.length},minmax(${schedule.length>8?40:0}px,1fr))`,'--phase-current':T.acid,'--phase-current-ink':T.heroInk} as CSSProperties} aria-label="Phasen des Trainingsplans">{groups.map(group=>{return <div key={group.start} className="w3-phase-step" style={{gridColumn:`span ${group.weeks}`}} data-active={group===active} data-past={group.start<active.start}>
   <div className="w3-phase-heading"><span>{LABELS[group.phase]??group.phase}</span></div>
   <div className="w3-phase-weeks" style={{gridTemplateColumns:`repeat(${group.weeks},minmax(0,1fr))`}} aria-label={`${LABELS[group.phase]??group.phase}: ${group.weeks} ${group.weeks===1?'Woche':'Wochen'}`}>{Array.from({length:group.weeks},(_,i)=>{
    const planWeek=group.start+i
    return <span key={planWeek} className="w3-phase-week" data-current={planWeek===index} data-past={planWeek<index} aria-current={planWeek===index?'step':undefined} aria-label={`Planwoche ${planWeek+1} · ${LABELS[group.phase]??group.phase} · Woche ${i+1} von ${group.weeks}${planWeek===index?' · aktuell':planWeek<index?' · vergangen':''}`}>{planWeek+1}</span>
   })}</div>
  </div>})}</div>
  <details className="w3-phase-context">
   <summary><span><span>Woche {index-active.start+1} von {active.weeks}</span> · {LABELS[active.phase]??active.phase}</span><span>{remaining ? `Noch ${remaining} ${remaining===1?'Woche':'Wochen'}` : 'Letzte Woche'}</span></summary>
   <div className="w3-phase-explanation">Planwoche {index+1} von {schedule.length}</div>
  </details>
 </>
}

import {useState,type CSSProperties} from 'react'
import {ArrowDown,ArrowUpRight} from 'lucide-react'
import {T} from './w3tokens'
import type {W3RidesVm,W3RidePeriod} from './W3RidesView'
import type {ActivityRhythm} from '../../api/rhythm'
import W3FocusCurve from './W3FocusCurve'
import W3ReturnInsight from './W3ReturnInsight'
import './w3Focus.css'
const nf=new Intl.NumberFormat('de-DE',{maximumFractionDigits:0})
export default function W3RidesFocus({vm,rhythm,period,onPeriod,onSetGoal,onOpenLatest}:{vm:W3RidesVm;rhythm?:ActivityRhythm|null;period:W3RidePeriod;onPeriod:(p:W3RidePeriod)=>void;onSetGoal:()=>void;onOpenLatest?:(id:number)=>void}){
 const [selected,setSelected]=useState<number|null>(null)
 const grain=rhythm?.[period],buckets=grain?.buckets.filter(b=>new Date(b.start+'T00:00:00')<=new Date())
 let sum=0
 const values=buckets?.map(b=>sum+=b.km)??vm.barMonths.map(b=>sum+=b.km)
 const labels=buckets?.map(b=>new Date(b.start+'T12:00:00').toLocaleDateString('de-DE',period==='season'?{month:'short'}:{day:'numeric',month:'short'}))??vm.barMonths.map(b=>`${b.label} ${b.year}`)
 const goal=period==='season'&&grain?vm.goal:null
 const km=selected!=null?nf.format(values[selected]??0):grain?nf.format(grain.km):vm.totalKm
 const today=new Date(),yearEnd=new Date(today.getFullYear()+1,0,1),daysLeft=Math.max(1,Math.ceil((yearEnd.getTime()-today.getTime())/86400000))
 const weekly=goal?Math.max(0,goal.targetKm-goal.currentKm)/daysLeft*7:null
 return <section className="w3-rides-focus" style={{'--focus-ink':T.ink,'--focus-muted':T.mid,'--focus-bg':T.bg,'--focus-card':T.surface,'--focus-raised':T.surface2,'--focus-line':T.rule,'--focus-acid':T.acid} as CSSProperties}>
 <div className="focus-periods" role="group" aria-label="Zeitraum">{([['week','Woche'],['month','Monat'],['season','Saison']] as const).map(([key,label])=><button key={key} aria-pressed={period===key} disabled={!rhythm&&key!=='season'} onClick={()=>{setSelected(null);onPeriod(key)}}>{label}</button>)}</div>
 <div className="focus-rides-total"><span>{selected!=null?`Bis ${labels[selected]}`:grain?.label??'Letzte zwölf Monate'}</span><h1>{km}<small>km</small></h1></div>
 <W3FocusCurve values={values} labels={labels} selected={selected} onSelect={setSelected} target={goal?.targetKm} forecast={goal?.projectedKm} elapsed={(today.getTime()-new Date(today.getFullYear(),0,1).getTime())/(yearEnd.getTime()-new Date(today.getFullYear(),0,1).getTime())}/>
 {vm.prAnnounce&&<W3ReturnInsight eyebrow="Gerade passiert" title={`${vm.prAnnounce.title} ist dein neuer Beleg.`} detail={vm.prAnnounce.sub} metrics={[{label:'Saison',value:vm.totalKm+' km',tone:'accent'},{label:'Tempo',value:vm.avgSpeed+' km/h'},{label:'Ø Leistung',value:vm.avgPower+' W'}]} actionLabel={onOpenLatest?'Fahrt öffnen':undefined} onAction={onOpenLatest?()=>onOpenLatest(vm.prAnnounce!.id):undefined}/>}
 <div className="focus-rides-facts"><div><strong>{grain?nf.format(grain.rides):vm.count.replace(/\s*Fahrten.*/, '')}</strong><span>Fahrten</span></div><div><strong>{grain?nf.format(grain.hours):vm.saddleTime}<small> h</small></strong><span>Im Sattel</span></div><div><strong>{grain?nf.format(grain.elevation_m):'—'}<small> m</small></strong><span>Aufgestiegen</span></div></div>
 {goal?<button className="focus-season-goal" onClick={onSetGoal}><div><span>Dein Saisonziel</span><strong>{nf.format(goal.targetKm)} km <ArrowUpRight size={15}/></strong></div><div className="focus-goal-meter"><i style={{width:`${Math.min(100,goal.progress*100)}%`}}/></div><div><span>{goal.realityLabel}</span><span>≈ {nf.format(goal.projectedKm)} km im aktuellen Tempo</span></div>{weekly!=null&&weekly>0&&<p>{nf.format(weekly)} km pro Woche bis zum Ziel</p>}</button>:period==='season'?<button className="focus-season-goal" onClick={onSetGoal}><div><strong>Wohin geht deine Saison?</strong><ArrowUpRight size={19}/></div><p>Eigenes Kilometerziel setzen</p></button>:null}
 <button className="focus-see-rides" onClick={()=>document.getElementById('focus-ride-archive')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}>Deine Fahrten<ArrowDown size={17}/></button>
 </section>
}

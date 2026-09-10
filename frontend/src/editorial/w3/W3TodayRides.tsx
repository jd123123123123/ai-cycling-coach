import W3RideTelemetryPanel from './W3RideTelemetryPanel'
import { AnimatePresence } from 'motion/react'
import { useId, useState, type ReactNode, type CSSProperties } from 'react'
import { ArrowUpRight, Mountain, Clock3 } from 'lucide-react'
import { useCrewRides } from '../../hooks/useCrewRides'
import { useCrewStandings } from '../../hooks/useCrew'
import type { CrewRide } from '../../api/crewRides'
import { W3CrewFeedView } from './W3CrewFeed'
import { smoothCurve } from './w3SmoothCurve'
import { T, FONT } from './w3tokens'
import './w3TodayRides.css'

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
export const otherCrewRides = (rides: CrewRide[]) => rides.filter(r => !r.is_mine).slice().sort((a,b) => Date.parse(b.started_at)-Date.parse(a.started_at))
const date = (v:string) => new Date(v).toLocaleDateString('de-DE',{day:'numeric',month:'short'})
const valid = (n:unknown): n is number => typeof n==='number' && Number.isFinite(n)
const duration = (s:number) => !valid(s)||s<=0?'—':s<3600?`${Math.floor(s/60)} min`:`${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')} h`
const distance = (m:number) => valid(m)&&m>0?nf.format(m/1000):'—'
function RideProfile({ride}:{ride:CrewRide}) {
 const id=useId()
 const elevation=ride.elevation_profile
 const series=elevation?.length ? elevation : ride.power_profile
 if(!series||series.length<2)return null
 const values=series.filter(Number.isFinite)
 if(values.length<2)return null
 const low=Math.min(...values),span=Math.max(1,Math.max(...values)-low)
 const points=series.map((v,i)=>Number.isFinite(v)?{x:i/(series.length-1)*270,y:75-(v-low)/span*60}:null)
 const line=smoothCurve(points)
 return <svg viewBox="0 0 270 82" className="w3-rides-profile" role="img" aria-label={elevation?.length?'Höhenprofil dieser Fahrt':'Leistungsverlauf dieser Fahrt'}>
  <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor={T.acid} stopOpacity=".22"/><stop offset="1" stopColor={T.acid} stopOpacity="0"/></linearGradient></defs>
  {points.every(Boolean)&&<path d={`${line} L270,82 L0,82 Z`} fill={`url(#${id})`}/>}
  <path d={line} fill="none" stroke={T.acid} strokeWidth="1.7" strokeLinecap="round"/>
 </svg>
}
export function W3TodayRidesSummaryView({rides,avatars={},pending=false,error=false,onOpenRide,selectedRideId,renderAnalysis}:{selectedRideId?:number|null;renderAnalysis?:(ride:CrewRide)=>ReactNode;rides:CrewRide[];avatars?:Record<number,string|null>;pending?:boolean;error?:boolean;onOpenRide:(id:number)=>void}) {
 const others=otherCrewRides(rides)
 const vars={'--rides-ink':T.ink,'--rides-mid':T.mid,'--rides-soft':T.surface2,'--rides-rule':T.rule,'--rides-acid':T.acid,fontFamily:FONT} as CSSProperties
 if(!others.length)return <p className="w3-rides-empty" style={vars}>{pending?'Fahrten werden geladen…':error?'Fahrten gerade nicht verfügbar.':'Die nächste Fahrt aus deiner Crew erscheint hier.'}</p>
 return <div className="w3-rides-rail" style={vars} aria-label="Letzte Fahrten anderer Crew-Mitglieder">{others.slice(0,5).map(ride=>{
  const photo=ride.photo_urls[0]
  return <article className="w3-rides-item" data-expanded={selectedRideId===ride.id} key={ride.id}><button type="button" aria-expanded={selectedRideId===ride.id} className="w3-rides-preview" data-photo={!!photo} key={ride.id} onClick={()=>onOpenRide(ride.id)} aria-label={`${ride.display_name||ride.handle}: ${ride.title}, ${distance(ride.distance_m)} Kilometer, Fahrt öffnen`}>
   {photo&&<img className="w3-rides-photo" src={photo} alt="" loading="lazy"/>}
   <span className="w3-rides-person"><span className="w3-rides-avatar">{avatars[ride.user_id]?<img src={avatars[ride.user_id]!} alt=""/>:(ride.display_name||ride.handle).slice(0,1)}</span><span>{ride.display_name||ride.handle}</span><time dateTime={ride.started_at}>{date(ride.started_at)}</time></span>
   <span className="w3-rides-distance">{distance(ride.distance_m)}<small>km</small></span>
   <span className="w3-rides-title">{ride.title}</span>
   {valid(ride.avg_power_w)&&<span className="w3-rides-watts">Ø {nf.format(ride.avg_power_w)} W</span>}
   {!photo&&<RideProfile ride={ride}/>}
   <span className="w3-rides-facts"><span><Clock3 size={12}/>{duration(ride.duration_seconds)}</span><span><Mountain size={12}/>{valid(ride.elevation_gain_m)?nf.format(ride.elevation_gain_m):'—'} m</span><ArrowUpRight size={16}/></span>
  </button><AnimatePresence initial={false}>{selectedRideId===ride.id&&renderAnalysis?.(ride)}</AnimatePresence></article>
 })}</div>
}
function useRides(){
 const query=useCrewRides(20),standings=useCrewStandings('week')
 const avatars:Record<number,string|null>={}
 for(const row of standings.data?.standings??[])avatars[row.user_id]=row.avatar??null
 return {rides:query.data??[],avatars,pending:query.isPending,error:query.isError,refresh:()=>void query.refetch()}
}
export function W3TodayRidesSummary(){
 const data=useRides(),[selected,setSelected]=useState<number|null>(null)
 return <W3TodayRidesSummaryView {...data} selectedRideId={selected} onOpenRide={id=>setSelected(current=>current===id?null:id)} renderAnalysis={ride=><W3RideTelemetryPanel key={ride.id} ride={ride} onClose={()=>setSelected(null)}/>}/>
}
export default function W3TodayRides(){
 const data=useRides()
 const rides=otherCrewRides(data.rides)
 return rides.length ? <W3CrewFeedView rides={rides} avatars={data.avatars} variant="page" chartsOnDemand onRefresh={data.refresh}/> : <W3TodayRidesSummaryView {...data} onOpenRide={()=>{}}/>
}

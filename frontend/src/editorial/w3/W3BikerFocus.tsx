import {useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {ArrowUpRight,Route,Mountain,Bike} from 'lucide-react'
import {usePowerProfile,type PowerProfile} from '../../hooks/usePowerProfile'
import type {ActivityListResponse} from '../../api/dashboard'
import type {CrewMineResponse} from '../../api/crew'
import {useActivitiesRange} from '../../hooks/useActivitiesRange'
import {useMyCrew} from '../../hooks/useCrew'
import {T} from './w3tokens'
import {curvePath} from './W3FocusCurve'
import {routePath} from './W3RideJournal'
const DURATIONS=[1,5,10,15,60,300,1200,3600]
const label=(s:number)=>s<60?`${s} s`:`${s/60} min`
const nf=new Intl.NumberFormat('de-DE',{maximumFractionDigits:0})
/** Authenticated profile only. Public comparisons continue to use the crew's
 * authorized endpoints; no private /me response is reused for another rider. */
export default function W3BikerFocus({preview}:{preview?:{power:PowerProfile;activities:ActivityListResponse;crew:CrewMineResponse}}){
 const result=usePowerProfile(),power=preview?.power??result.data,isPending=preview?false:result.isPending,isError=preview?false:result.isError,refetch=result.refetch
 const now=useMemo(()=>new Date(),[]),start=useMemo(()=>new Date(now.getFullYear(),0,1),[now])
 const activityResult=useActivitiesRange(start,now),activities=preview?.activities??activityResult.data
 const crewResult=useMyCrew(),crew=preview?.crew??crewResult.data
 const [duration,setDuration]=useState(5),[unit,setUnit]=useState<'W'|'W/kg'>('W'),[query,setQuery]=useState('')
 const rides=(activities?.activities??[]).filter(a=>a.sport==='cycling').sort((a,b)=>b.started_at.localeCompare(a.started_at))
 const values=DURATIONS.map(d=>((unit==='W/kg'?power?.wkg_curve:power?.mmp_curve)?.[String(d)])??null),maximum=Math.max(1,...values.map(v=>v??0))
 const points=values.map((v,i)=>v==null?null:[12+i/7*316,140-v/maximum*115])
 const segments=points.reduce<number[][][]>((out,p)=>{if(!p)out.push([]);else out.at(-1)!.push(p);return out},[[]])
 const value=values[DURATIONS.indexOf(duration)]
 const weekdays=rides.reduce<Record<string,number>>((out,r)=>{const d=new Date(r.started_at).toLocaleDateString('de-DE',{weekday:'long'});out[d]=(out[d]??0)+1;return out},{})
 const favourite=Object.entries(weekdays).sort((a,b)=>b[1]-a[1])[0]?.[0]
 const distanceRides=rides.filter(r=>r.distance_meters!=null),avg=distanceRides.length?distanceRides.reduce((s,r)=>s+(r.distance_meters??0),0)/distanceRides.length/1000:null
 const members=crew?.members.filter(m=>m.handle.toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de')))??[]
 return <>
 <section className="profile-focus-power profile-card"><header><h2>Deine Bestleistungen</h2><div className="profile-power-unit"><button aria-pressed={unit==='W'} onClick={()=>setUnit('W')}>W</button><button aria-pressed={unit==='W/kg'} onClick={()=>setUnit('W/kg')}>W/kg</button></div></header>
 {isError?<button className="profile-inline" onClick={()=>void refetch()}>Leistungsdaten erneut laden</button>:<><div className="profile-power-read"><strong>{value!=null?value.toLocaleString('de-DE',{maximumFractionDigits:unit==='W'?0:2}):'—'}<small>{unit}</small></strong><span>{isPending?'Wird geladen…':`${label(duration)} · persönlicher Bestwert`}</span></div>
 <svg viewBox="0 0 340 158" role="img" aria-label="Persönliche Bestleistung von einer Sekunde bis einer Stunde">{[40,90,140].map(y=><line key={y} x1="12" x2="328" y1={y} y2={y} stroke={T.rule}/>)}{segments.map((p,i)=><path key={i} d={curvePath(p)} fill="none" stroke={T.acid} strokeWidth="2.5" strokeLinecap="round"/>)}{points.map((p,i)=>p&&<circle key={i} cx={p[0]} cy={p[1]} r={DURATIONS[i]===duration?5:2.5} fill={DURATIONS[i]===duration?T.ink:T.acid}/>)}</svg>
 <div className="profile-power-durations">{DURATIONS.map(s=><button key={s} aria-pressed={duration===s} onClick={()=>setDuration(s)}>{label(s)}</button>)}</div>{value==null&&!isPending&&<p className="profile-focus-note">{unit==='W/kg'&&!power?.wkg_curve?'Für W/kg fehlt dein Gewicht.':'Für diese Dauer fehlt noch eine Leistungsmessung.'}</p>}
 {power?.threshold_watts!=null&&<Link className="profile-power-threshold" to="/power-profile"><span>FTP</span><strong>{nf.format(power.threshold_watts)} W</strong><ArrowUpRight size={17}/></Link>}</>}
 </section>
 {rides.length>0&&<section className="profile-focus-rides"><header><h2>Zuletzt unterwegs</h2><Link to="/e/w3-rides">Alle<ArrowUpRight size={15}/></Link></header><div className="profile-rides-gallery">{rides.slice(0,5).map(r=><Link key={r.id} to={`/e/w3-ride/${r.id}`}><div>{r.route_polyline?.length?<svg viewBox="0 0 100 100" aria-label="GPS-Spur"><path d={routePath(r.route_polyline)} fill="none" stroke={T.acid} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>:<Bike size={36} strokeWidth={1}/>}</div><span>{new Date(r.started_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</span><strong>{r.distance_meters!=null?nf.format(r.distance_meters/1000):'—'}<small> km</small></strong><p>{r.title??'Ausfahrt'}</p></Link>)}</div></section>}
 {rides.length>0&&<div className="profile-fun-facts">{avg!=null&&<div><Route size={18}/><strong>{nf.format(avg)} km</strong><span>deine typische Distanz</span></div>}{favourite&&<div><Mountain size={18}/><strong>{favourite}</strong><span>dein häufigster Radtag</span></div>}</div>}
 <section className="profile-card profile-rider-search"><header><h2>Rider entdecken</h2><Link to="/e/w3-crew">Crew<ArrowUpRight size={15}/></Link></header>{crew?.crew?<><input type="search" value={query} placeholder="In deiner Crew suchen" aria-label="Rider in deiner Crew suchen" onChange={e=>setQuery(e.target.value)}/>{members.map(m=><Link key={m.user_id} to={`/e/w3-crew-member/${m.user_id}?period=year`}><span>{m.handle}</span><ArrowUpRight size={16}/></Link>)}{!members.length&&<p>Kein Rider mit diesem Namen.</p>}</>:<Link className="profile-power-threshold" to="/e/w3-crew">Crew finden und gemeinsam vergleichen<ArrowUpRight size={17}/></Link>}</section>
 </>
}

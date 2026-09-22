import {useMemo, useState} from 'react'
import {ArrowDownUp,ArrowUpRight, Bike, Search, X} from 'lucide-react'
import {motion, useReducedMotion} from 'motion/react'
import type {W3RideCard, W3RidesVm, W3RideFilter, W3RidePeriod} from './W3RidesView'
import type {ActivityRhythm} from '../../api/rhythm'
import W3RidesFocus from './W3RidesFocus'
import W3RideMap from './W3RideMap'
import {Link} from 'react-router-dom'
import {T} from './w3tokens'
import './w3RideJournal.css'
const number=(s:string)=>s==='—'?s:s.replace('.',',')
export function routePath(points:[number,number][]){
 const good=points.filter(p=>p.every(Number.isFinite));if(good.length<2)return ''
 const center=good.reduce((s,p)=>s+p[0],0)/good.length
 const cos=Math.max(.01,Math.cos(center*Math.PI/180))
 const xs=good.map(p=>p[1]*cos),ys=good.map(p=>p[0]);let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity
 xs.forEach(x=>{x0=Math.min(x0,x);x1=Math.max(x1,x)});ys.forEach(y=>{y0=Math.min(y0,y);y1=Math.max(y1,y)})
 const scale=82/Math.max(x1-x0,y1-y0,1e-6),ox=(100-(x1-x0)*scale)/2,oy=(100-(y1-y0)*scale)/2
 return good.map((_,i)=>`${i?'L':'M'}${(ox+(xs[i]-x0)*scale).toFixed(2)},${(oy+(y1-ys[i])*scale).toFixed(2)}`).join(' ')
}
function RouteArt({ride,hero=false}:{ride:W3RideCard;hero?:boolean}){
 const reduce=useReducedMotion(),path=useMemo(()=>routePath(ride.polyline??[]),[ride.polyline])
 return <div className={`w3-journal-route ${hero?'is-hero':''}`} aria-hidden>{path?<svg viewBox="0 0 100 100"><path d={path} fill="none" stroke="currentColor" strokeWidth={hero?5:4} opacity=".08"/><motion.path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" initial={reduce?false:{pathLength:0}} animate={{pathLength:1}} transition={{duration:.8}}/></svg>:<Bike size={hero?65:32} strokeWidth={1}/>}</div>
}
function RideCard({ride,hero,onOpen}:{ride:W3RideCard;hero?:boolean;onOpen:(id:number)=>void}){
 const [open,setOpen]=useState(false)
 return <article className={`w3-journal-ride ${hero?'is-hero':''}`}>
  <div className="focus-ride-cover"><span className="focus-ride-date">{ride.dateLabel}</span>{ride.polyline&&ride.polyline.length>1?<W3RideMap polyline={ride.polyline} w={350} h={210} tint={T.acid} distanceM={(Number(ride.km)||0)*1000}/>:<RouteArt ride={ride} hero/>}</div>
  <div className="focus-ride-read"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)} aria-label={`${ride.title}, ${number(ride.km)} Kilometer, Details`}><div><h3>{ride.title}</h3><div className="focus-ride-meta"><strong>{number(ride.km)}<small> km</small></strong><span>{ride.dur} h</span>{ride.elevation!=null&&<span>{Math.round(ride.elevation).toLocaleString('de-DE')} m</span>}</div></div><ArrowUpRight size={18} style={{transform:open?'rotate(90deg)':undefined}}/></button>
  {open&&<div className="focus-ride-detail"><div><span>{ride.power} W Ø</span><span>{number(ride.speed)} km/h</span>{ride.tss!=null&&<span>{Math.round(ride.tss)} TSS</span>}</div>{!ride.polyline?.length&&<p>{ride.indoor?'Indoorfahrt':'Keine GPS-Spur verfügbar'}</p>}{ride.id!=null&&<Link to={`/e/w3-ride/${ride.id}`} onClick={e=>{e.preventDefault();onOpen(ride.id!)}}>Fahrt analysieren<ArrowUpRight size={16}/></Link>}</div>}</div>
 </article>
}
/**
 * W3 - FAHRTEN, DIE LISTE.
 *
 * DER ZEITRAUM KOMMT VON OBEN. Saison / Monat / Woche sass im Kopf und blieb
 * dort: wer auf WOCHE stellte, bekam eine Wochenzahl ueber allen Fahrten des
 * Jahres. Jetzt reicht `W3RidesView` denselben Zustand an beide, und die Liste
 * schneidet sich am Fensteranfang, den der SERVER nennt -- dem ersten Balken
 * des Korns. Damit zaehlt die Ueberschrift dieselben Fahrten, aus denen die
 * Zahl darueber gerechnet ist.
 *
 * `Alle / Outdoor / Indoor / Rennen` bleibt daneben stehen. Das ist eine ANDERE
 * Frage -- was fuer eine Fahrt --, und zwei Fragen duerfen zwei Regler haben.
 */
export function RideJournal({vm,period,windowStart,windowLabel,onOpen}:{vm:W3RidesVm;period:W3RidePeriod;windowStart:string|null;windowLabel:string|null;onOpen:(id:number)=>void}){
 const [filter,setFilter]=useState<W3RideFilter>('all'),[query,setQuery]=useState(''),[search,setSearch]=useState(false),[limit,setLimit]=useState(12),[sort,setSort]=useState<'recent'|'oldest'|'distance'|'power'|'duration'|'elevation'>('recent')
 const shown=useMemo(()=>{
  /** Ohne Fensteranfang wird nicht gefiltert: ein noch nicht geladener
   *  Rhythmus darf keine Fahrten verschwinden lassen. Eine Fahrt OHNE Datum
   *  faellt heraus, solange ein Fenster gilt -- wir behaupten keine
   *  Zugehoerigkeit, die wir nicht pruefen koennen. */
  const inWindow=(r:W3RideCard)=>!windowStart||(r.dateISO!=null&&r.dateISO.slice(0,10)>=windowStart.slice(0,10))
  const metric=(value:string)=>{const clean=value.replace(/\s/g,'').replace(',','.');if(clean.includes(':')){const [hours,minutes]=clean.split(':').map(Number);return (hours||0)+(minutes||0)/60}return Number.parseFloat(clean)||0}
  const rows=vm.rides.filter(r=>inWindow(r)&&(filter==='all'||filter==='indoor'&&r.indoor||filter==='outdoor'&&!r.indoor||filter==='race'&&r.race)&&`${r.title} ${r.dateLabel}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de')))
  if(sort==='recent')return rows
  if(sort==='oldest')return [...rows].reverse()
  if(sort==='elevation')return [...rows].sort((a,b)=>(b.elevation??0)-(a.elevation??0))
  return [...rows].sort((a,b)=>metric(b[sort==='distance'?'km':sort==='power'?'power':'dur'])-metric(a[sort==='distance'?'km':sort==='power'?'power':'dur']))
 },[vm.rides,query,filter,sort,windowStart])
 return <section id="focus-ride-archive" className="w3-ride-journal"><header className="w3-journal-heading"><div><h1>Deine Fahrten.</h1><span>{windowStart&&windowLabel?`${shown.length} ${shown.length===1?'Fahrt':'Fahrten'} \u00b7 ${windowLabel}`:vm.count}</span></div><button className="w3-journal-icon" aria-label={search?'Suche schließen':'Fahrten suchen'} onClick={()=>{setSearch(!search);setQuery('')}}>{search?<X size={20}/>:<Search size={20}/>}</button></header>
 {search&&<label className="w3-journal-search"><Search size={18}/><input autoFocus value={query} placeholder="Fahrt oder Datum suchen" aria-label="Fahrt oder Datum suchen" onChange={e=>{setQuery(e.target.value);setLimit(12)}}/></label>}
 <div className="w3-journal-filters" role="group" aria-label="Fahrten filtern">{([['all','Alle'],['outdoor','Outdoor'],['indoor','Indoor'],['race','Rennen']] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setLimit(12)}}>{label}</button>)}</div>
 <label className="w3-journal-sort"><ArrowDownUp size={16}/><select aria-label="Fahrten sortieren" value={sort} onChange={e=>{setSort(e.target.value as typeof sort);setLimit(12)}}>{([['recent','Neueste zuerst'],['oldest','Älteste zuerst'],['distance','Längste Strecke'],['elevation','Meiste Höhenmeter'],['power','Höchste Leistung'],['duration','Längste Dauer']] as const).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 {vm.prAnnounce&&<button className="w3-journal-record" onClick={()=>onOpen(vm.prAnnounce!.id)}><span>{vm.prAnnounce.title.replace(' · ',' — ')}</span><ArrowUpRight size={18}/></button>}
 {shown.length?<><RideCard ride={shown[0]} hero onOpen={onOpen}/>{shown.length>1&&<div className="w3-journal-archive"><h2>Weitere Fahrten</h2>{shown.slice(1,limit).map((r,i)=><RideCard key={r.id??i} ride={r} onOpen={onOpen}/>)}</div>}{shown.length>limit&&<button className="w3-journal-more" onClick={()=>setLimit(n=>n+20)}>Weitere Fahrten laden <span>{shown.length-limit}</span></button>}</>:<div className="w3-journal-empty"><Bike size={44} strokeWidth={1}/><h2>{vm.rides.length?'Keine passende Fahrt':'Hier beginnt deine Geschichte.'}</h2><p>{vm.rides.length?(period==='season'?'Wähle einen anderen Filter oder Suchbegriff.':`In diesem Zeitraum liegt keine Fahrt. Stelle oben auf Saison, oder wähle einen anderen Filter.`):'Deine synchronisierten Fahrten erscheinen hier.'}</p>{vm.rides.length>0&&<button onClick={()=>{setFilter('all');setQuery('')}}>Alle Fahrten zeigen</button>}</div>}
 </section>
}
export function RideSummary(props:{vm:W3RidesVm;rhythm?:ActivityRhythm|null;period:W3RidePeriod;onPeriod:(p:W3RidePeriod)=>void;onSetGoal:()=>void;onOpenLatest?:(id:number)=>void}) {return <W3RidesFocus {...props}/>}

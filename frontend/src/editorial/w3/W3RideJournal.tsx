import {useMemo, useState} from 'react'
import {ArrowDownUp,ArrowUpRight, Bike, Search, X} from 'lucide-react'
import {motion, useReducedMotion} from 'motion/react'
import type {W3RideCard, W3RidesVm, W3RideFilter, W3RidePeriod} from './W3RidesView'
import type {ActivityRhythm} from '../../api/rhythm'
import W3RidesHero from './W3RidesHero'
import {T} from './w3tokens'
import './w3RideJournal.css'
const nf=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1})
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
 return <button type="button" disabled={ride.id==null} className={`w3-journal-ride ${hero?'is-hero':''}`} onClick={()=>ride.id!=null&&onOpen(ride.id)} aria-label={`${ride.title}, ${number(ride.km)} Kilometer, ${ride.dateLabel}`}>
  <div className="w3-journal-ride-head"><time>{ride.dateLabel}</time><ArrowUpRight size={18}/></div>
  <div className="w3-journal-ride-body"><div><h3>{ride.title}</h3><div className="w3-journal-distance"><strong>{number(ride.km)}</strong><span>km</span></div>{!ride.polyline?.length&&<span className="w3-journal-no-route">Ohne GPS-Spur</span>}</div><RouteArt ride={ride} hero={hero}/></div>
  <div className="w3-journal-ride-stats" aria-label="Fahrtdaten">
    <span><small>DAUER</small><strong>{ride.dur}<em> h</em></strong></span>
    <span><small>Ø TEMPO</small><strong>{number(ride.speed)}<em> km/h</em></strong></span>
    <span><small>Ø LEISTUNG</small><strong>{ride.power}<em> W</em></strong></span>
  </div>
  {hero&&ride.note&&<p className="w3-journal-ride-note">{ride.note}</p>}
 </button>
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
 const [filter,setFilter]=useState<W3RideFilter>('all'),[query,setQuery]=useState(''),[search,setSearch]=useState(false),[limit,setLimit]=useState(12),[sort,setSort]=useState<'recent'|'distance'|'power'|'duration'>('recent')
 const shown=useMemo(()=>{
  /** Ohne Fensteranfang wird nicht gefiltert: ein noch nicht geladener
   *  Rhythmus darf keine Fahrten verschwinden lassen. Eine Fahrt OHNE Datum
   *  faellt heraus, solange ein Fenster gilt -- wir behaupten keine
   *  Zugehoerigkeit, die wir nicht pruefen koennen. */
  const inWindow=(r:W3RideCard)=>!windowStart||(r.dateISO!=null&&r.dateISO.slice(0,10)>=windowStart.slice(0,10))
  const metric=(value:string)=>{const clean=value.replace(/\s/g,'').replace(',','.');if(clean.includes(':')){const [hours,minutes]=clean.split(':').map(Number);return (hours||0)+(minutes||0)/60}return Number.parseFloat(clean)||0}
  const rows=vm.rides.filter(r=>inWindow(r)&&(filter==='all'||filter==='indoor'&&r.indoor||filter==='outdoor'&&!r.indoor||filter==='race'&&r.race)&&`${r.title} ${r.dateLabel}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de')))
  if(sort==='recent')return rows
  return [...rows].sort((a,b)=>metric(b[sort==='distance'?'km':sort==='power'?'power':'dur'])-metric(a[sort==='distance'?'km':sort==='power'?'power':'dur']))
 },[vm.rides,query,filter,sort,windowStart])
 return <section className="w3-ride-journal"><header className="w3-journal-heading"><div><h1>Deine Fahrten.</h1><span>{windowStart&&windowLabel?`${shown.length} ${shown.length===1?'Fahrt':'Fahrten'} \u00b7 ${windowLabel}`:vm.count}</span></div><button className="w3-journal-icon" aria-label={search?'Suche schließen':'Fahrten suchen'} onClick={()=>{setSearch(!search);setQuery('')}}>{search?<X size={20}/>:<Search size={20}/>}</button></header>
 {search&&<label className="w3-journal-search"><Search size={18}/><input autoFocus value={query} placeholder="Fahrt oder Datum suchen" aria-label="Fahrt oder Datum suchen" onChange={e=>{setQuery(e.target.value);setLimit(12)}}/></label>}
 <div className="w3-journal-filters" role="group" aria-label="Fahrten filtern">{([['all','Alle'],['outdoor','Outdoor'],['indoor','Indoor'],['race','Rennen']] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setLimit(12)}}>{label}</button>)}</div>
 <div className="w3-journal-sort" role="group" aria-label="Fahrten sortieren"><ArrowDownUp size={14}/><span>Sortieren</span>{([['recent','Neueste'],['distance','Distanz'],['power','Leistung'],['duration','Dauer']] as const).map(([key,label])=><button key={key} aria-pressed={sort===key} onClick={()=>{setSort(key);setLimit(12)}}>{label}</button>)}</div>
 {vm.prAnnounce&&<button className="w3-journal-record" onClick={()=>onOpen(vm.prAnnounce!.id)}><span>{vm.prAnnounce.title.replace(' · ',' — ')}</span><ArrowUpRight size={18}/></button>}
 {shown.length?<><RideCard ride={shown[0]} hero onOpen={onOpen}/>{shown.length>1&&<div className="w3-journal-archive"><h2>Weitere Fahrten</h2>{shown.slice(1,limit).map((r,i)=><RideCard key={r.id??i} ride={r} onOpen={onOpen}/>)}</div>}{shown.length>limit&&<button className="w3-journal-more" onClick={()=>setLimit(n=>n+20)}>Weitere Fahrten laden <span>{shown.length-limit}</span></button>}</>:<div className="w3-journal-empty"><Bike size={44} strokeWidth={1}/><h2>{vm.rides.length?'Keine passende Fahrt':'Hier beginnt deine Geschichte.'}</h2><p>{vm.rides.length?(period==='season'?'Wähle einen anderen Filter oder Suchbegriff.':`In diesem Zeitraum liegt keine Fahrt. Stelle oben auf Saison, oder wähle einen anderen Filter.`):'Deine synchronisierten Fahrten erscheinen hier.'}</p>{vm.rides.length>0&&<button onClick={()=>{setFilter('all');setQuery('')}}>Alle Fahrten zeigen</button>}</div>}
 </section>
}
/** Der Kopf. Den Zeitraum BESITZT er nicht mehr -- er bekommt ihn und meldet
 *  den Wechsel nach oben, damit die Liste denselben Ausschnitt zeigt. */
/** Ein Detailwert in der aufgeklappten Zeile. */
function Detail({v,t}:{v:string;t:string}){
 return <span style={{display:'flex',alignItems:'baseline',gap:4}}>
  <strong style={{fontSize:16,fontWeight:700,letterSpacing:-.3,color:T.ink,fontVariantNumeric:'tabular-nums'}}>{v}</strong>
  <span style={{fontSize:11.5,fontWeight:500,color:T.quiet}}>{t}</span>
 </span>
}

export function RideSummary({vm,rhythm,period,onPeriod,onSetGoal}:{vm:W3RidesVm;rhythm?:ActivityRhythm|null;period:W3RidePeriod;onPeriod:(p:W3RidePeriod)=>void;onSetGoal:()=>void}){
 const [selected,setSelected]=useState<number|null>(null),[open,setOpen]=useState(false)
 const win=rhythm?.[period],buckets=win?.buckets??vm.barMonths.map(m=>({km:m.km})),values=buckets.map(b=>b.km),picked=selected==null?null:buckets[selected]
 const label=(i:number)=>win?new Date(`${win.buckets[i].start}T12:00:00`).toLocaleDateString('de-DE',period==='season'?{month:'short'}:{day:'numeric',month:'short'}):`${vm.barMonths[i].label} ${vm.barMonths[i].year}`
 const meta=picked&&win?[['FAHRTEN',String(win.buckets[selected!].rides),''],['ZEIT',nf.format(win.buckets[selected!].hours),' h'],['HÖHENMETER',nf.format(win.buckets[selected!].elevation_m),' hm']]:win?[['FAHRTEN',String(win.rides),''],['ZEIT',nf.format(win.hours),' h'],['HÖHENMETER',nf.format(win.elevation_m),' hm']]:[['FAHRTEN',vm.count.replace(/\s*Fahrten.*$/,''),''],['SATTELZEIT',vm.saddleTime,' h'],['Ø LEISTUNG',vm.avgPower,' W']]
 const previous=values.length>1?values[values.length-2]:values[0]??0,current=values.at(-1)??0,trendDelta=previous?Math.round((current-previous)/previous*100):0,trend=trendDelta>3?'Aufbauend':trendDelta<-3?'Ruhiger':'Stabil'
 const details=<div style={{display:'flex',flexWrap:'wrap',gap:16,fontSize:12.5,color:'inherit'}}>
  {picked&&win?<><Detail v={String(win.buckets[selected!].rides)} t="Fahrten"/><Detail v={nf.format(win.buckets[selected!].hours)} t="h"/><Detail v={nf.format(win.buckets[selected!].elevation_m)} t="hm"/></>
   :win?<><Detail v={String(win.rides)} t="Fahrten"/><Detail v={nf.format(win.hours)} t="h"/><Detail v={nf.format(win.elevation_m)} t="hm"/></>
   :<><Detail v={vm.avgSpeed} t="km/h Ø"/><Detail v={vm.avgPower} t="W Ø"/><Detail v={vm.saddleTime} t="h"/></>}
 </div>
 return <W3RidesHero
  periods={rhythm?[{key:'season',text:'Saison'},{key:'month',text:'Monat'},{key:'week',text:'Woche'}]:undefined}
  period={rhythm?period:undefined}
  onPeriod={k=>{onPeriod(k as W3RidePeriod);setSelected(null)}}
  km={picked?nf.format(picked.km):win?nf.format(win.km):vm.totalKm}
  deck={selected!=null?label(selected):win?.label??'Letzte 12 Monate'}
  values={values} labels={label} selected={selected} onSelect={setSelected}
  trendKicker={period==='season'?'Saison-Trend':period==='month'?'30-Tage-Trend':'7-Tage-Trend'}
  trendLabel={trend} trendPct={trendDelta}
  ledger={meta.map(([l,v,u])=>({label:l,value:v,unit:u.trim()||undefined}))}
  goal={period==='season'&&selected==null&&vm.goal?vm.goal:null}
  onSetGoal={period==='season'&&selected==null?onSetGoal:undefined}
  open={open} onToggle={()=>setOpen(!open)} details={details}/>

}

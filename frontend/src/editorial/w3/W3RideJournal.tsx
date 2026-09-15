import {useMemo, useState} from 'react'
import {ArrowDownUp,ArrowUpRight, Bike, Search, X, Plus, Minus} from 'lucide-react'
import {motion, useReducedMotion} from 'motion/react'
import type {W3RideCard, W3RidesVm, W3RideFilter} from './W3RidesView'
import type {ActivityRhythm} from '../../api/rhythm'
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
function RhythmGraph({values,labels,selected,onSelect}:{values:number[];labels:(i:number)=>string;selected:number|null;onSelect:(index:number|null)=>void}){
 const width=280,height=86,pad=7,max=Math.max(1,...values),step=values.length>1?(width-pad*2)/(values.length-1):0
 const points=values.map((value,index)=>[pad+index*step,height-pad-(value/max)*(height-pad*2)] as const)
 const line=points.length?`M ${points[0][0]} ${points[0][1]} ${points.slice(1).map((p,i)=>{const prev=points[i],mid=(prev[0]+p[0])/2;return `Q ${mid} ${prev[1]} ${p[0]} ${p[1]}`}).join(' ')}`:''
 const area=line?`${line} L ${points.at(-1)![0]} ${height-pad} L ${points[0][0]} ${height-pad} Z`:''
 return <div className="w3-summary-graph" role="group" aria-label="Kilometertrend">
  <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="w3-summary-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c6f53c" stopOpacity=".38"/><stop offset="1" stopColor="#c6f53c" stopOpacity="0"/></linearGradient></defs><path d={area} fill="url(#w3-summary-fill)"/><path d={line} fill="none" stroke="#c6f53c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  {points.map(([x,y],index)=><button key={index} aria-label={`${labels(index)}: ${nf.format(values[index])} Kilometer`} aria-pressed={selected===index} className="w3-summary-point" style={{left:`${x/width*100}%`,top:`${y/height*100}%`}} onClick={()=>onSelect(selected===index?null:index)}><i/></button>)}
 </div>
}
export function RideJournal({vm,onOpen}:{vm:W3RidesVm;onOpen:(id:number)=>void}){
 const [filter,setFilter]=useState<W3RideFilter>('all'),[query,setQuery]=useState(''),[search,setSearch]=useState(false),[limit,setLimit]=useState(12),[sort,setSort]=useState<'recent'|'distance'|'power'|'duration'>('recent')
 const shown=useMemo(()=>{
  const metric=(value:string)=>{const clean=value.replace(/\s/g,'').replace(',','.');if(clean.includes(':')){const [hours,minutes]=clean.split(':').map(Number);return (hours||0)+(minutes||0)/60}return Number.parseFloat(clean)||0}
  const rows=vm.rides.filter(r=>(filter==='all'||filter==='indoor'&&r.indoor||filter==='outdoor'&&!r.indoor||filter==='race'&&r.race)&&`${r.title} ${r.dateLabel}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de')))
  if(sort==='recent')return rows
  return [...rows].sort((a,b)=>metric(b[sort==='distance'?'km':sort==='power'?'power':'dur'])-metric(a[sort==='distance'?'km':sort==='power'?'power':'dur']))
 },[vm.rides,query,filter,sort])
 return <section className="w3-ride-journal"><header className="w3-journal-heading"><div><h1>Deine Fahrten.</h1><span>{vm.count}</span></div><button className="w3-journal-icon" aria-label={search?'Suche schließen':'Fahrten suchen'} onClick={()=>{setSearch(!search);setQuery('')}}>{search?<X size={20}/>:<Search size={20}/>}</button></header>
 {search&&<label className="w3-journal-search"><Search size={18}/><input autoFocus value={query} placeholder="Fahrt oder Datum suchen" aria-label="Fahrt oder Datum suchen" onChange={e=>{setQuery(e.target.value);setLimit(12)}}/></label>}
 <div className="w3-journal-filters" role="group" aria-label="Fahrten filtern">{([['all','Alle'],['outdoor','Outdoor'],['indoor','Indoor'],['race','Rennen']] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setLimit(12)}}>{label}</button>)}</div>
 <div className="w3-journal-sort" role="group" aria-label="Fahrten sortieren"><ArrowDownUp size={14}/><span>Sortieren</span>{([['recent','Neueste'],['distance','Distanz'],['power','Leistung'],['duration','Dauer']] as const).map(([key,label])=><button key={key} aria-pressed={sort===key} onClick={()=>{setSort(key);setLimit(12)}}>{label}</button>)}</div>
 {vm.prAnnounce&&<button className="w3-journal-record" onClick={()=>onOpen(vm.prAnnounce!.id)}><span>{vm.prAnnounce.title.replace(' · ',' — ')}</span><ArrowUpRight size={18}/></button>}
 {shown.length?<><RideCard ride={shown[0]} hero onOpen={onOpen}/>{shown.length>1&&<div className="w3-journal-archive"><h2>Weitere Fahrten</h2>{shown.slice(1,limit).map((r,i)=><RideCard key={r.id??i} ride={r} onOpen={onOpen}/>)}</div>}{shown.length>limit&&<button className="w3-journal-more" onClick={()=>setLimit(n=>n+20)}>Weitere Fahrten laden <span>{shown.length-limit}</span></button>}</>:<div className="w3-journal-empty"><Bike size={44} strokeWidth={1}/><h2>{vm.rides.length?'Keine passende Fahrt':'Hier beginnt deine Geschichte.'}</h2><p>{vm.rides.length?'Wähle einen anderen Filter oder Suchbegriff.':'Deine synchronisierten Fahrten erscheinen hier.'}</p>{vm.rides.length>0&&<button onClick={()=>{setFilter('all');setQuery('')}}>Alle Fahrten zeigen</button>}</div>}
 </section>
}
export function RideSummary({vm,rhythm,onSetGoal}:{vm:W3RidesVm;rhythm?:ActivityRhythm|null;onSetGoal:()=>void}){
 const [period,setPeriod]=useState<'season'|'month'|'week'>('season'),[selected,setSelected]=useState<number|null>(null),[open,setOpen]=useState(false)
 const win=rhythm?.[period],buckets=win?.buckets??vm.barMonths.map(m=>({km:m.km})),values=buckets.map(b=>b.km),picked=selected==null?null:buckets[selected]
 const label=(i:number)=>win?new Date(`${win.buckets[i].start}T12:00:00`).toLocaleDateString('de-DE',period==='season'?{month:'short'}:{day:'numeric',month:'short'}):`${vm.barMonths[i].label} ${vm.barMonths[i].year}`
 const meta=picked&&win?[['FAHRTEN',String(win.buckets[selected!].rides),''],['ZEIT',nf.format(win.buckets[selected!].hours),' h'],['HÖHENMETER',nf.format(win.buckets[selected!].elevation_m),' hm']]:win?[['FAHRTEN',String(win.rides),''],['ZEIT',nf.format(win.hours),' h'],['HÖHENMETER',nf.format(win.elevation_m),' hm']]:[['FAHRTEN',vm.count.replace(/\s*Fahrten.*$/,''),''],['SATTELZEIT',vm.saddleTime,' h'],['Ø LEISTUNG',vm.avgPower,' W']]
 const previous=values.length>1?values[values.length-2]:values[0]??0,current=values.at(-1)??0,trendDelta=previous?Math.round((current-previous)/previous*100):0,trend=trendDelta>3?'Aufbauend':trendDelta<-3?'Ruhiger':'Stabil'
 return <section className="w3-ride-summary" aria-label="Deine Kilometer"><header>{rhythm?<div role="group" aria-label="Zeitraum">{([['season','Saison'],['month','Monat'],['week','Woche']]as const).map(([key,text])=><button aria-pressed={period===key} key={key} onClick={()=>{setPeriod(key);setSelected(null)}}>{text}</button>)}</div>:<span>Letzte 12 Monate</span>}<button className="w3-journal-icon is-small" aria-label={open?'Kilometerdetails schließen':'Kilometerdetails öffnen'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<Minus size={17}/>:<Plus size={17}/>}</button></header>
 <div className="w3-summary-main"><div><strong>{picked?nf.format(picked.km):win?nf.format(win.km):vm.totalKm}</strong><span>km</span><p>{selected!=null?label(selected):win?.label??'Deine gefahrenen Kilometer'}</p></div><RhythmGraph values={values} labels={label} selected={selected} onSelect={index=>setSelected(index)}/></div>
 <div className={`w3-summary-trend trend-${trend.toLowerCase()}`}><span>{period==='season'?'SAISON-TREND':period==='month'?'30-TAGE-TREND':'7-TAGE-TREND'}</span><strong>{trend}</strong><em>{trendDelta>=0?'+':''}{trendDelta}%</em></div>
 <div className="w3-summary-meta" aria-label="Zusammenfassung">{meta.map(([label,value,unit])=><span key={label}><small>{label}</small><strong>{value}<em>{unit}</em></strong></span>)}</div>
 {period==='season'&&selected==null&&<div className="w3-summary-goal-card" aria-label="Saisonziel">
   {vm.goal?<>
    <div className="w3-summary-goal-head"><span>SAISONZIEL</span><strong>{nf.format(vm.goal.currentKm)} / {nf.format(vm.goal.targetKm)} km</strong></div>
    <div className="w3-summary-goal-track" aria-hidden="true"><i style={{width:`${Math.min(100,vm.goal.progress*100)}%`}}/></div>
    <div className="w3-summary-goal-read"><strong>{vm.goal.realityLabel}</strong><span>{vm.goal.projectionLabel}</span></div>
   </>:<button className="w3-summary-goal-cta" onClick={onSetGoal}><span><b>Dein Saisonziel</b><small>Setze eine Marke, die zu dir gehört.</small></span><ArrowUpRight size={16}/></button>}
 </div>}
 {open&&<div className="w3-summary-details">{picked&&win?<><span><strong>{win.buckets[selected!].rides}</strong> Fahrten</span><span><strong>{nf.format(win.buckets[selected!].hours)}</strong> h</span><span><strong>{nf.format(win.buckets[selected!].elevation_m)}</strong> hm</span></>:win?<><span><strong>{win.rides}</strong> Fahrten</span><span><strong>{nf.format(win.hours)}</strong> h</span><span><strong>{nf.format(win.elevation_m)}</strong> hm</span></>:!picked?<><span><strong>{vm.avgSpeed}</strong> km/h Ø</span><span><strong>{vm.avgPower}</strong> W Ø</span><span><strong>{vm.saddleTime}</strong> h</span></>:<span>Monatsdistanz: {nf.format(picked.km)} km</span>}</div>}
 {open&&period==='season'&&selected==null&&vm.goal&&<button className="w3-summary-goal" onClick={onSetGoal}>{vm.goal.chip} · {vm.goal.ofGoalPct}<ArrowUpRight size={16}/></button>}
 </section>
}

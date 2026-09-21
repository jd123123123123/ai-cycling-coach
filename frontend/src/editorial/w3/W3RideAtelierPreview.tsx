import { useId, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock3, Mountain, Route, Trophy, X, Info, Share2 } from 'lucide-react'
import { T, FONT } from './w3tokens'
import { FIXTURE, REVIEW } from './W3RideDetailPreview'
import { FIXTURE as TODAY } from './W3TodayPreview'
import W3RideBestEfforts from './W3RideBestEfforts'
import W3TrainingReview from './W3TrainingReview'
import W3RideMapHero from './W3RideMapHero'
import type { TrainingReview } from '../../api/trainingReview'
import type { W3RideVm } from './W3RideDetailView'
import type { W3Block } from './W3Sections'
import { AtelierRideAnalysis, AtelierFTPHistory } from './AtelierRideAnalysis'
import { AtelierStoryShare, type RideStory } from './AtelierStoryShare'
import { ATELIER_SAMPLES, ATELIER_FTP, ftpWindow, ftpPlot, ridePlot, rideMean, METRICS, formatValue, elapsed, powerZone, type RideMetric, type PlotModel } from './atelierRideData'
import './w3RideAtelier.css'

const n = (v:number) => v.toLocaleString('de-DE',{maximumFractionDigits:1})
const nav = ['Fahrt','Analyse','Bestwerte','Plan'] as const
type Panel = typeof nav[number]

/** North-up GPS silhouette with latitude compensation. It is a route, not invented terrain. */
export function routeSilhouette(points:[number,number][]){
 if(points.length<2)return ''
 const lat=points.reduce((sum,p)=>sum+p[0],0)/points.length
 const projected=points.map(([y,x])=>[x*Math.cos(lat*Math.PI/180),-y])
 const xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1])
 const loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys)
 const scale=Math.min(294/Math.max(.00001,hiX-loX),240/Math.max(.00001,hiY-loY))
 return projected.map(([x,y],i)=>`${i?'L':'M'}${(180+(x-(hiX+loX)/2)*scale).toFixed(2)},${(140+(y-(hiY+loY)/2)*scale).toFixed(2)}`).join(' ')
}

function RouteObject({points}:{points:[number,number][]}){
 const reduce=useReducedMotion(), id=useId(),path=routeSilhouette(points)
 return <svg viewBox="0 0 360 280" className="atelier-route-object" role="img" aria-label="Nordorientierter GPS-Verlauf dieser Fahrt">
  <defs><linearGradient id={id} x1="0" x2="1" y1="0" y2="1"><stop stopColor={T.acidLite}/><stop offset=".45" stopColor={T.acid}/><stop offset="1" stopColor={T.acidDeep}/></linearGradient></defs>
  <path d={path} transform="translate(0 6)" fill="none" stroke={T.shadowSoft} strokeWidth="13" strokeLinejoin="round"/>
  <path d={path} fill="none" stroke={T.heroOff} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
  <motion.path d={path} fill="none" stroke={`url(#${id})`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={reduce?false:{pathLength:0}} animate={{pathLength:1}} transition={{duration:1.3,ease:[.2,.7,.2,1]}}/>
  <text x="327" y="36" fill={T.mid} fontSize="10">N</text><path d="M331 43v18m-3-15 3-3 3 3" stroke={T.mid} fill="none"/>
 </svg>
}

/** Every arc is a share of recorded zone time. A tap exposes minutes and any stored reference. */
export function ZoneDial({review}:{review:TrainingReview}){
 const zones=review.zones.map((z,i)=>({...z,index:i})).filter(z=>(z.actual_seconds??0)>0)
 const [selected,setSelected]=useState<number|null>(null)
 const total=zones.reduce((sum,z)=>sum+(z.actual_seconds??0),0)
 const dominant=zones.reduce((a,b)=>(a?.actual_seconds??0)>(b.actual_seconds??0)?a:b,zones[0])
 const active=zones.find(z=>z.index===selected)??dominant
 const reduce=useReducedMotion(),id=useId()
 if(!total||!active)return <p className="atelier-empty">Keine Leistungsbereiche aufgezeichnet.</p>
 let accumulated=0
 const parts=zones.map(z=>{const offset=accumulated/total*100,length=(z.actual_seconds??0)/total*100;accumulated+=z.actual_seconds??0;return {...z,offset,length}})
 const percent=Math.round(active.actual_seconds!/total*100)
 return <>
  <div className="atelier-dial">
   <svg viewBox="0 0 360 350" role="img" aria-label={`${active.label}: ${n(active.actual_seconds!/60)} Minuten, ${percent} Prozent der gemessenen Zonenzeit`}>
    <defs><linearGradient id={id} x1="0" x2=".7" y1="0" y2="1"><stop stopColor={T.acidLite}/><stop offset="1" stopColor={T.acidDeep}/></linearGradient></defs>
    <circle cx="180" cy="172" r="140" fill="none" stroke={T.rule}/>
    {Array.from({length:60},(_,i)=>{const a=i*Math.PI/30;return <line key={i} x1={180+Math.sin(a)*149} y1={172-Math.cos(a)*149} x2={180+Math.sin(a)*(i%5?152:157)} y2={172-Math.cos(a)*(i%5?152:157)} stroke={i%5?T.heroOff:T.mid} strokeWidth="1"/>})}
    {parts.map(z=><motion.circle key={z.index} cx="180" cy="172" r="122" pathLength="100" transform="rotate(-90 180 172)" fill="none" stroke={z.index===active.index?`url(#${id})`:T.heroOff} strokeWidth={z.index===active.index?22:12} strokeDasharray={`${Math.max(.01,z.length-1.3)} ${100-Math.max(.01,z.length-1.3)}`} strokeDashoffset={-z.offset} initial={false} animate={{opacity:z.index===active.index?1:.6}} transition={{duration:reduce?0:.25}}/>) }
    <circle cx="180" cy="172" r="101" fill="none" stroke={T.rule}/>
   </svg>
   <div className="atelier-dial-reading" aria-live="polite"><span>{active.label}</span><strong key={active.label}>{n(active.actual_seconds!/60)}<small>min</small></strong><span>{percent} % deiner Zonenzeit</span></div>
  </div>
  <div className="atelier-zone-select" role="group" aria-label="Leistungsbereich wählen">{zones.map(z=><button type="button" key={z.index} aria-pressed={active.index===z.index} aria-label={`Zone ${z.index+1}: ${z.label}`} onClick={()=>setSelected(z.index)}><span>Z{z.index+1}</span><i style={{height:`${8+(z.actual_seconds??0)/total*38}px`}}/></button>)}</div>
  <p className="atelier-zone-context">{review.planned_title&&active.planned_seconds!=null?<><span>{n(active.planned_seconds/60)} min</span> waren empfohlen.</>:<>Zeit im gemessenen Leistungsbereich.</>}</p>
 </>
}

export function PlanConsequence({review,rideDate}:{review:TrainingReview;rideDate:string}){
 const historical = new Date(rideDate).toDateString() !== new Date().toDateString()
 const change=review.changes[0]
 const duration=review.pairs.find(p=>p.label==='Dauer')
 const load=review.pairs.find(p=>p.unit==='TSS')
 const saved=Boolean(review.planned_title)
 const delta=saved&&load?.actual!=null&&load.planned!=null?load.actual-load.planned:null
 return <div className="atelier-plan">
  <div className="atelier-panel-title"><span>{historical?'Planvergleich dieser Fahrt':'Nach dieser Fahrt'}</span><h2>{delta!=null?`${delta>0?'+':''}${n(delta)} TSS\nzum Plan.`:'Deine Fahrt\nim Plan.'}</h2></div>
  <div className="atelier-plan-comparison">{[duration,load].filter(p=>p?.actual!=null).map(p=>{
   const max=Math.max(1,p!.actual!,saved?p!.planned??0:0)
   return <div key={p!.label}><div><span>{p!.label}</span><strong>{n(p!.actual!)} <small>{p!.unit}</small></strong></div><div className="atelier-dose"><i style={{width:`${p!.actual!/max*100}%`}}/>{saved&&p!.planned!=null&&<b style={{left:`${p!.planned/max*100}%`}}/>}</div>{saved&&p!.planned!=null&&<small>Empfohlen {n(p!.planned)} {p!.unit}</small>}</div>
  })}</div>
  {change?<div className="atelier-next-session"><span>{new Date(`${change.date}T12:00:00`).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'short'})}{review.adaptation?.automatic&&<Check size={16}/>}</span><del>{change.before}</del><strong>{change.after}</strong><details><summary>Warum wurde angepasst?</summary><p>{change.reason}</p></details></div>:<p className="atelier-empty">{historical?'Keine Änderung dieser Fahrt zugeordnet.':review.adaptation?.reason??'Keine Änderung dieser Fahrt zugeordnet.'}</p>}
 </div>
}

export function RideAtelier({vm,review,rideDate}:{vm:W3RideVm;review:TrainingReview;rideDate:string}){
 const [panel,setPanel]=useState<Panel>(()=>{const requested=new URLSearchParams(window.location.search).get('panel');return requested==='Leistung'?'Analyse':nav.find(p=>p===requested)??'Fahrt'}),[details,setDetails]=useState(false)
 const reduce=useReducedMotion()
 const [metric,setMetric]=useState<RideMetric>(()=>METRICS.find(m=>m.key===new URLSearchParams(window.location.search).get('metric'))?.key??'power'),[sample,setSample]=useState<number|null>(null),[sharing,setSharing]=useState(false)
 const [bestMode,setBestMode]=useState<'efforts'|'ftp'>(()=>new URLSearchParams(window.location.search).get('view')==='ftp'?'ftp':'efforts'),[days,setDays]=useState(90),[ftpIndex,setFtpIndex]=useState<number|null>(null),[effort,setEffort]=useState(300),[zones,setZones]=useState(false)
 const actualZoneSeconds=Array.from({length:7},()=>0)
 ATELIER_SAMPLES.slice(0,-1).forEach((s,i)=>{if(s.power!=null)actualZoneSeconds[powerZone(s.power,280)]+=ATELIER_SAMPLES[i+1].seconds-s.seconds})
 const analysisReview={...review,zones:['Erholung','Ausdauer','Tempo','Schwelle','VO₂-Bereich','Anaerob','Sprint'].map((label,i)=>({label,actual_seconds:actualZoneSeconds[i],planned_seconds:review.zones[i]?.planned_seconds??null}))}
 const history=ftpWindow(ATELIER_FTP,days,'2026-09-21')
 const record=vm.ranks.find(r=>r.pr&&r.bestWattsValue!=null&&r.wattsValue>r.bestWattsValue)
 const duration=review.pairs.find(p=>p.label==='Dauer')?.actual

 const config=METRICS.find(m=>m.key===metric)!,point=sample==null?null:ATELIER_SAMPLES[sample]
 const currentEffort=vm.ranks.find(r=>r.durationSeconds===effort)??record??vm.ranks[0]
 const sorted=[...vm.ranks].sort((a,b)=>a.durationSeconds-b.durationSeconds)
 const minDuration=Math.log(sorted[0]?.durationSeconds??1),maxDuration=Math.log(sorted.at(-1)?.durationSeconds??2)
 const effortX=(d:number)=>sorted.length===1 ? .5 :(Math.log(d)-minDuration)/(maxDuration-minDuration)
 const effortPlot:PlotModel={marker:currentEffort?{x:effortX(currentEffort.durationSeconds),y:currentEffort.wattsValue,color:T.acid}:undefined,low:0,high:Math.max(1,...sorted.flatMap(r=>[r.wattsValue,r.bestWattsValue??0])),unit:'W',xLabels:[sorted[0]?.dur.toLowerCase()??'','',sorted.at(-1)?.dur.toLowerCase()??''],series:[{color:T.mid,dashed:true,points:sorted.map(r=>r.bestWattsValue==null?null:{x:effortX(r.durationSeconds),y:r.bestWattsValue})},{color:T.acid,points:sorted.map(r=>({x:effortX(r.durationSeconds),y:r.wattsValue}))}]}
 let story:RideStory={title:vm.title,eyebrow:'Ausfahrt abgeschlossen',value:vm.bigStat,unit:vm.bigStatUnit,caption:'Dein Höhenprofil über die Fahrzeit',date:vm.hero.dateLine.split(' · ')[0],demo:true,routePath:vm.polyline?routeSilhouette(vm.polyline):undefined,plot:ridePlot(ATELIER_SAMPLES,'altitude',null,null),facts:[{label:'Fahrzeit',value:vm.hero.duration},{label:'Höhenmeter',value:vm.climb},{label:'Ø Tempo',value:vm.avgSpeed}]}
 if(panel==='Analyse')story={...story,routePath:undefined,title:config.label,eyebrow:vm.title,value:formatValue(point?point[metric]:metric==='altitude'?Math.max(...ATELIER_SAMPLES.map(s=>s.altitude??0)):rideMean(ATELIER_SAMPLES,metric),metric==='speed'?1:0),unit:config.unit,caption:point?`Bei ${elapsed(point.seconds)} h / ${formatValue(point.distance/1000,1)} km`:metric==='altitude'?'Höchster aufgezeichneter Punkt':'Zeitgewichteter Fahrtdurchschnitt',plot:ridePlot(ATELIER_SAMPLES,metric,sample,280,190),facts:[{label:'FTP zur Fahrt',value:'280 W'},{label:'Fahrzeit',value:vm.hero.duration},{label:'Distanz',value:`${vm.bigStat} km`}]}
 if(panel==='Bestwerte'&&bestMode==='efforts'&&currentEffort)story={...story,routePath:undefined,title:currentEffort.pr?'Ein neuer Bestwert.':'Deine Leistung.',eyebrow:`${currentEffort.dur} / ${vm.title}`,value:formatValue(currentEffort.wattsValue),unit:'W',caption:currentEffort.bestWattsValue==null?'Kein früherer Vergleich':`Bisher ${formatValue(currentEffort.bestWattsValue)} W / ${currentEffort.wattsValue-currentEffort.bestWattsValue>0?'+':''}${formatValue(currentEffort.wattsValue-currentEffort.bestWattsValue)} W`,plot:effortPlot,facts:[{label:'Leistungsdauer',value:currentEffort.dur},{label:'Distanz',value:`${vm.bigStat} km`},{label:'Fahrzeit',value:vm.hero.duration}]}
 if(panel==='Bestwerte'&&bestMode==='ftp'){const active=history[ftpIndex??history.length-1],first=history[0],last=history.at(-1);story={...story,routePath:undefined,title:'Dein FTP-Verlauf.',eyebrow:`FTP / ${days} Tage`,value:formatValue(active?.watts),unit:'W',caption:active?`${active.source} am ${active.date}`:'Keine Messungen',plot:ftpPlot(history,ftpIndex),facts:[{label:'Erster Wert',value:`${formatValue(first?.watts)} W`},{label:'Letzter Wert',value:`${formatValue(last?.watts)} W`},{label:'Veränderung',value:history.length>1?`${last!.watts-first.watts>0?'+':''}${formatValue(last!.watts-first.watts)} W`:'—'}]}}
 if(panel==='Plan'){const load=review.pairs.find(p=>p.unit==='TSS'),delta=load?.actual!=null&&load.planned!=null&&review.planned_title?load.actual-load.planned:null;story={...story,routePath:undefined,title:'Deine Fahrt im Plan.',eyebrow:vm.title,value:delta==null?'—':`${delta>0?'+':''}${formatValue(delta)}`,unit:'TSS',caption:'Abweichung zur gespeicherten Empfehlung',plot:undefined,comparisons:review.pairs.filter(p=>p.actual!=null).map(p=>({label:p.label,actual:p.actual!,planned:review.planned_title?p.planned:null,unit:p.unit})),facts:[{label:'Gefahren',value:`${formatValue(load?.actual)} TSS`},{label:'Empfohlen',value:`${formatValue(load?.planned)} TSS`},{label:'Planfolge',value:review.changes[0]?.after??'Keine Änderung'}]}}
 return <article className="atelier-device">
  <header className="atelier-app-header"><a href="/e/w3-ride-preview" aria-label="Zur bisherigen Vorschau"><ArrowLeft size={20}/></a><span>{vm.hero.dateLine.split(' · ')[0]}</span><div className="atelier-header-actions"><button type="button" aria-label="Diese Ansicht teilen" onClick={()=>setSharing(true)}><Share2 size={18}/></button><button type="button" onClick={()=>setDetails(!details)} aria-expanded={details} aria-label={details?'Details schließen':'Fahrtdetails öffnen'}>{details?<X size={20}/>:<Info size={20}/>}</button></div></header>
  <div className="atelier-story" onTouchStart={e=>{e.currentTarget.dataset.touch=String(e.touches[0].clientX);e.currentTarget.dataset.touchY=String(e.touches[0].clientY)}} onTouchEnd={e=>{if((e.target as Element).closest('svg,input,button'))return;const diff=e.changedTouches[0].clientX-Number(e.currentTarget.dataset.touch);if(Math.abs(diff)>70&&Math.abs(diff)>Math.abs(e.changedTouches[0].clientY-Number(e.currentTarget.dataset.touchY))){const i=nav.indexOf(panel);setPanel(nav[Math.max(0,Math.min(nav.length-1,i+(diff<0?1:-1)))])}}}>
   <AnimatePresence mode="wait" initial={false}><motion.div key={panel} className={`atelier-story-panel atelier-story-${panel}`} initial={reduce?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={reduce?undefined:{opacity:0,y:-8}} transition={{duration:.22}}>
    {panel==='Fahrt'&&<>
     <div className="atelier-panel-title"><span>Ausfahrt abgeschlossen</span><h1>{vm.title}</h1></div>
     <div className="atelier-distance"><strong>{vm.bigStat}</strong><span>{vm.bigStatUnit}</span></div>
     {vm.polyline&&vm.polyline.length>1?<RouteObject points={vm.polyline}/>:<p className="atelier-empty">Keine GPS-Route aufgezeichnet.</p>}
     <div className="atelier-ride-facts"><div><Clock3 size={17}/><strong>{duration==null?vm.hero.duration:`${Math.floor(duration/60)}h ${Math.round(duration%60)}min`}</strong><span>Fahrzeit</span></div><div><Mountain size={18}/><strong>{vm.climb}</strong><span>Höhenmeter</span></div><div><Route size={17}/><strong>{vm.avgSpeed}</strong><span>Ø Tempo</span></div></div>
     {record&&<button type="button" className="atelier-record-note" onClick={()=>setPanel('Bestwerte')}><Trophy size={18}/><span><strong>+{n(record.wattsValue-record.bestWattsValue!)} W</strong> auf {record.dur.toLowerCase()}</span><ArrowUpRight size={19}/></button>}
    </>}
    {panel==='Analyse'&&<><AtelierRideAnalysis samples={ATELIER_SAMPLES} metric={metric} selected={sample} ftp={280} hrMax={190} onMetric={setMetric} onSelect={setSample}/><button className="atelier-zones-disclosure" aria-expanded={zones} onClick={()=>setZones(!zones)}>{zones?'Leistungszonen schließen':'Leistungszonen ansehen'}</button>{zones&&<div className="atelier-zones-expanded"><ZoneDial review={analysisReview}/></div>}</>}
    {panel==='Bestwerte'&&<><div className="atelier-best-mode" aria-label="Leistungsentwicklung auswählen"><button aria-pressed={bestMode==='efforts'} onClick={()=>setBestMode('efforts')}>Bestwerte der Fahrt</button><button aria-pressed={bestMode==='ftp'} onClick={()=>setBestMode('ftp')}>FTP-Trend</button></div>{bestMode==='efforts'?<><div className="atelier-panel-title"><span>Deine persönlichen Bestleistungen</span><h2>{'Diese Fahrt\nim Vergleich.'}</h2></div><W3RideBestEfforts ranks={vm.ranks} selectedDuration={effort} onSelectDuration={setEffort}/>{!vm.ranks.length&&<p className="atelier-empty">Noch keine vergleichbaren Leistungswerte.</p>}</>:<AtelierFTPHistory entries={history} days={days} selected={ftpIndex} onDays={n=>{setDays(n);setFtpIndex(null)}} onSelect={setFtpIndex}/>}</>}
    {panel==='Plan'&&<PlanConsequence review={review} rideDate={rideDate}/>} 
   </motion.div></AnimatePresence>
  </div>
  <nav className="atelier-chapter-nav" aria-label="Fahrtrückblick wählen">{nav.map(p=><button type="button" key={p} aria-pressed={p===panel} onClick={()=>setPanel(p)}>{p}{p===panel&&<motion.i layoutId="atelier-panel" transition={{duration:reduce?0:.25}}/>}</button>)}</nav>
  {sharing&&<AtelierStoryShare story={story} onClose={()=>setSharing(false)}/>}
  {details&&<div className="atelier-deep-details"><W3RideMapHero editorial vm={vm.hero}/><W3TrainingReview review={review} rideDate={rideDate}/></div>}
 </article>
}

function WorkoutSculpture({blocks}:{blocks:W3Block[]}){
 const [active,setActive]=useState<number|null>(null),[info,setInfo]=useState(false)
 const reduce=useReducedMotion(),id=useId()
 const slot=296/Math.max(1,blocks.length),w=Math.max(3,slot-5)
 return <div className="atelier-workout-sculpture">
  <svg viewBox="0 0 360 230" role="img" aria-label="Räumliche Vorschau der Trainingsabschnitte, schematisch ohne Zeitachse">
   <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={T.acidLite}/><stop offset=".55" stopColor={T.acid}/><stop offset="1" stopColor={T.acidDeep}/></linearGradient></defs>
   <path d="M22 209H324l15-16H37Z" fill={T.surface2}/>
   {blocks.map((b,i)=>{const x=23+i*slot,h=12+Math.max(0,Math.min(1,b.w))*136,y=207-h;return <motion.g key={i} initial={reduce?false:{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:reduce?0:i*.025,duration:.35}} opacity={active==null||active===i?1:.48}><path d={`M${x} ${y}l12-12h${w}l-12 12Z`} fill={b.work?T.acidLite:T.mid}/><path d={`M${x+w} ${y}l12-12v${h}l-12 12Z`} fill={b.work?T.acidDeep:T.heroOff}/><rect x={x} y={y} width={w} height={h} fill={b.work?`url(#${id})`:T.heroOff}/><path d={`M${x} ${y}h${w}`} stroke={T.ink} opacity=".35"/></motion.g>})}
  </svg>
  <div className="atelier-workout-hit" role="group" aria-label="Trainingsabschnitt wählen">{blocks.map((b,i)=><button type="button" key={i} aria-pressed={active===i} aria-label={b.label} onClick={()=>setActive(active===i?null:i)}/>)}</div>
  <div className="atelier-workout-reading"><span>{active==null?'Trainingsabschnitt antippen':blocks[active].label}</span><button type="button" aria-label="Grafik erklären" aria-expanded={info} onClick={()=>setInfo(!info)}><Info size={16}/></button></div>
  {info&&<p className="atelier-qualifier">Schematische Trainingsabschnitte. Breite und Perspektive sind keine Zeit- oder Watt-Skala.</p>}
 </div>
}

function TodayAtelier(){
 const reduce=useReducedMotion()
 const [open,setOpen]=useState(false),[share,setShare]=useState(false)
 const day=TODAY.weekDays.find(d=>d.status==='today')??TODAY.weekDays[0]
 const blocks=TODAY.sessionBlocks.map((b,i)=>{const watts=b.label.match(/(\d+)\s*W/);return watts?{x:i/Math.max(1,TODAY.sessionBlocks.length-1),y:Number(watts[1])}:null})
 const story:RideStory={title:day.title??'Deine Einheit',eyebrow:'Deine nächste Einheit',value:(day.targetW??'—').replace(/\s*W$/,''),unit:'W',date:'Trainingsvorschau',caption:'Abschnittsfolge / keine Zeitachse',demo:true,plot:{low:0,high:350,unit:'W',xLabels:['1','Abschnitte',String(blocks.length)],series:[{points:blocks,color:T.acid}]},facts:[{label:'Dauer',value:TODAY.sessionDur??'—'},{label:'Belastung',value:`${formatValue(day.planned)} TSS`},{label:'Zielbereich',value:day.ftpPct?`${day.ftpPct} FTP`:'—'}]}
 return <article className="atelier-device atelier-today-device">
  <header className="atelier-app-header"><span>HEUTE</span><span>Trainingskarte · Entwurf</span><button aria-label="Trainingskarte teilen" onClick={()=>setShare(true)}><Share2 size={18}/></button></header>
  <section className="atelier-today-card">
   <div className="atelier-today-heading"><div><span>Deine nächste Einheit</span><h1>{day.title}</h1></div><button type="button" aria-label={open?'Einheit zuklappen':'Einheit aufklappen'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X size={17}/>:<ArrowUpRight size={18}/>}</button></div>
   <WorkoutSculpture blocks={TODAY.sessionBlocks}/>
   <div className="atelier-training-facts"><div><span>Zielbereich</span><strong>{day.targetW}</strong></div><div><span>Fahrzeit</span><strong>{TODAY.sessionDur}</strong></div></div>
   <AnimatePresence>{open&&<motion.div className="atelier-today-expanded" initial={reduce?false:{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} transition={{duration:reduce?0:.25}}><div className="atelier-dose-summary"><span>{day.ftpPct} FTP</span><span>{day.planned} TSS</span></div><a className="atelier-primary" href="/e/w3-session-preview">Einheit ansehen<ArrowRight size={19}/></a></motion.div>}</AnimatePresence>
  </section>
  {share&&<AtelierStoryShare story={story} onClose={()=>setShare(false)}/>}
  <div className="atelier-preview-note">Neue Gestaltung der Trainingskarte.<br/>Dein Bike und die übrigen Heute-Module bleiben bestehen.</div>
 </article>
}

export default function W3RideAtelierPreview(){
 const [screen,setScreen]=useState<'ride'|'today'>(()=>new URLSearchParams(window.location.search).get('screen')==='today'?'today':'ride')
 const tokens={'--a-bg':T.bg,'--a-surface':T.surface,'--a-soft':T.surface2,'--a-ink':T.ink,'--a-mid':T.mid,'--a-acid':T.acid,'--a-rule':T.rule,'--report-ink':T.ink,'--report-mid':T.mid,'--report-acid':T.acid,'--report-line':T.rule,'--report-bg':T.bg,fontFamily:FONT} as CSSProperties
 return <main className="atelier-preview" style={tokens}><div className="atelier-preview-controls"><span>RIDR · neuer Entwurf · Beispieldaten</span><div><button type="button" aria-pressed={screen==='ride'} onClick={()=>setScreen('ride')}>Fahrtrückblick</button><button type="button" aria-pressed={screen==='today'} onClick={()=>setScreen('today')}>Heute</button></div></div>{screen==='ride'?<RideAtelier vm={FIXTURE} review={REVIEW} rideDate="2026-09-21T09:12:00"/>:<TodayAtelier/>}<aside className="atelier-references"><a href="https://www.awwwards.com/sites/radian" target="_blank" rel="noreferrer">Radian / Awwwards ↗</a><a href="https://tideguide.com/" target="_blank" rel="noreferrer">Tide Guide ↗</a><a href="https://developer.apple.com/design/awards/" target="_blank" rel="noreferrer">Apple Design Awards ↗</a></aside></main>
}

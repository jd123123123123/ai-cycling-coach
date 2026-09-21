import { useId, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock3, Mountain, Route, Trophy, X, Info } from 'lucide-react'
import { T, FONT } from './w3tokens'
import { FIXTURE, REVIEW } from './W3RideDetailPreview'
import { FIXTURE as TODAY } from './W3TodayPreview'
import W3RideBestEfforts from './W3RideBestEfforts'
import W3TrainingReview from './W3TrainingReview'
import W3RideMapHero from './W3RideMapHero'
import type { TrainingReview } from '../../api/trainingReview'
import type { W3RideVm } from './W3RideDetailView'
import type { W3Block } from './W3Sections'
import './w3RideAtelier.css'

const n = (v:number) => v.toLocaleString('de-DE',{maximumFractionDigits:1})
const nav = ['Fahrt','Leistung','Bestwerte','Plan'] as const
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
 const [panel,setPanel]=useState<Panel>(()=>{const requested=new URLSearchParams(window.location.search).get('panel');return nav.find(p=>p===requested)??'Fahrt'}),[details,setDetails]=useState(false)
 const reduce=useReducedMotion()
 const record=vm.ranks.find(r=>r.pr&&r.bestWattsValue!=null&&r.wattsValue>r.bestWattsValue)
 const duration=review.pairs.find(p=>p.label==='Dauer')?.actual
 const dominant=review.zones.reduce<(typeof review.zones)[number]|undefined>((best,z)=>(z.actual_seconds??0)>(best?.actual_seconds??0)?z:best,undefined)
 return <article className="atelier-device">
  <header className="atelier-app-header"><a href="/e/w3-ride-preview" aria-label="Zur bisherigen Vorschau"><ArrowLeft size={20}/></a><span>{vm.hero.dateLine.split(' · ')[0]}</span><button type="button" onClick={()=>setDetails(!details)} aria-expanded={details} aria-label={details?'Details schließen':'Fahrtdetails öffnen'}>{details?<X size={20}/>:<Info size={20}/>}</button></header>
  <div className="atelier-story" onTouchStart={e=>{e.currentTarget.dataset.touch=String(e.touches[0].clientX);e.currentTarget.dataset.touchY=String(e.touches[0].clientY)}} onTouchEnd={e=>{const diff=e.changedTouches[0].clientX-Number(e.currentTarget.dataset.touch);if(Math.abs(diff)>70&&Math.abs(diff)>Math.abs(e.changedTouches[0].clientY-Number(e.currentTarget.dataset.touchY))){const i=nav.indexOf(panel);setPanel(nav[Math.max(0,Math.min(nav.length-1,i+(diff<0?1:-1)))])}}}>
   <AnimatePresence mode="wait" initial={false}><motion.div key={panel} className={`atelier-story-panel atelier-story-${panel}`} initial={reduce?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={reduce?undefined:{opacity:0,y:-8}} transition={{duration:.22}}>
    {panel==='Fahrt'&&<>
     <div className="atelier-panel-title"><span>Ausfahrt abgeschlossen</span><h1>{vm.title}</h1></div>
     <div className="atelier-distance"><strong>{vm.bigStat}</strong><span>{vm.bigStatUnit}</span></div>
     {vm.polyline&&vm.polyline.length>1?<RouteObject points={vm.polyline}/>:<p className="atelier-empty">Keine GPS-Route aufgezeichnet.</p>}
     <div className="atelier-ride-facts"><div><Clock3 size={17}/><strong>{duration==null?vm.hero.duration:`${Math.floor(duration/60)}h ${Math.round(duration%60)}min`}</strong><span>Fahrzeit</span></div><div><Mountain size={18}/><strong>{vm.climb}</strong><span>Höhenmeter</span></div><div><Route size={17}/><strong>{vm.avgSpeed}</strong><span>Ø Tempo</span></div></div>
     {record&&<button type="button" className="atelier-record-note" onClick={()=>setPanel('Bestwerte')}><Trophy size={18}/><span><strong>+{n(record.wattsValue-record.bestWattsValue!)} W</strong> auf {record.dur.toLowerCase()}</span><ArrowUpRight size={19}/></button>}
    </>}
    {panel==='Leistung'&&<><div className="atelier-panel-title"><span>Gemessene Leistungsbereiche</span><h2>{dominant?`Schwerpunkt\n${dominant.label}.`:'Deine Leistungsbereiche.'}</h2></div><ZoneDial review={review}/></>}
    {panel==='Bestwerte'&&<><div className="atelier-panel-title"><span>Deine persönlichen Bestleistungen</span><h2>{'Diese Fahrt\nim Vergleich.'}</h2></div><W3RideBestEfforts ranks={vm.ranks}/>{!vm.ranks.length&&<p className="atelier-empty">Noch keine vergleichbaren Leistungswerte.</p>}</>}
    {panel==='Plan'&&<PlanConsequence review={review} rideDate={rideDate}/>} 
   </motion.div></AnimatePresence>
  </div>
  <nav className="atelier-chapter-nav" aria-label="Fahrtrückblick wählen">{nav.map(p=><button type="button" key={p} aria-pressed={p===panel} onClick={()=>setPanel(p)}>{p}{p===panel&&<motion.i layoutId="atelier-panel" transition={{duration:reduce?0:.25}}/>}</button>)}</nav>
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
 const [open,setOpen]=useState(false)
 const day=TODAY.weekDays.find(d=>d.status==='today')??TODAY.weekDays[0]
 return <article className="atelier-device atelier-today-device">
  <header className="atelier-app-header"><span>HEUTE</span><span>Trainingskarte · Entwurf</span></header>
  <section className="atelier-today-card">
   <div className="atelier-today-heading"><div><span>Deine nächste Einheit</span><h1>{day.title}</h1></div><button type="button" aria-label={open?'Einheit zuklappen':'Einheit aufklappen'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X size={17}/>:<ArrowUpRight size={18}/>}</button></div>
   <WorkoutSculpture blocks={TODAY.sessionBlocks}/>
   <div className="atelier-training-facts"><div><span>Zielbereich</span><strong>{day.targetW}</strong></div><div><span>Fahrzeit</span><strong>{TODAY.sessionDur}</strong></div></div>
   <AnimatePresence>{open&&<motion.div className="atelier-today-expanded" initial={reduce?false:{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} transition={{duration:reduce?0:.25}}><div className="atelier-dose-summary"><span>{day.ftpPct} FTP</span><span>{day.planned} TSS</span></div><a className="atelier-primary" href="/e/w3-session-preview">Einheit ansehen<ArrowRight size={19}/></a></motion.div>}</AnimatePresence>
  </section>
  <div className="atelier-preview-note">Neue Gestaltung der Trainingskarte.<br/>Dein Bike und die übrigen Heute-Module bleiben bestehen.</div>
 </article>
}

export default function W3RideAtelierPreview(){
 const [screen,setScreen]=useState<'ride'|'today'>(()=>new URLSearchParams(window.location.search).get('screen')==='today'?'today':'ride')
 const tokens={'--a-bg':T.bg,'--a-surface':T.surface,'--a-soft':T.surface2,'--a-ink':T.ink,'--a-mid':T.mid,'--a-acid':T.acid,'--a-rule':T.rule,'--report-ink':T.ink,'--report-mid':T.mid,'--report-acid':T.acid,'--report-line':T.rule,'--report-bg':T.bg,fontFamily:FONT} as CSSProperties
 return <main className="atelier-preview" style={tokens}><div className="atelier-preview-controls"><span>RIDR · neuer Entwurf · Beispieldaten</span><div><button type="button" aria-pressed={screen==='ride'} onClick={()=>setScreen('ride')}>Fahrtrückblick</button><button type="button" aria-pressed={screen==='today'} onClick={()=>setScreen('today')}>Heute</button></div></div>{screen==='ride'?<RideAtelier vm={FIXTURE} review={REVIEW} rideDate="2026-09-21T09:12:00"/>:<TodayAtelier/>}<aside className="atelier-references"><a href="https://www.awwwards.com/sites/radian" target="_blank" rel="noreferrer">Radian / Awwwards ↗</a><a href="https://tideguide.com/" target="_blank" rel="noreferrer">Tide Guide ↗</a><a href="https://developer.apple.com/design/awards/" target="_blank" rel="noreferrer">Apple Design Awards ↗</a></aside></main>
}

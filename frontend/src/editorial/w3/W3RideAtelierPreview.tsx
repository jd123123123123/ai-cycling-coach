import { RideAtelier } from './W3RideAtelierView'
export { RideAtelier, ZoneDial, PlanConsequence, routeSilhouette } from './W3RideAtelierView'
import { useId, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ArrowUpRight, X, Info, Share2 } from 'lucide-react'
import { T, FONT } from './w3tokens'
import { FIXTURE, REVIEW } from './W3RideDetailPreview'
import { FIXTURE as TODAY } from './W3TodayPreview'
import type { W3RideVm } from './rideAtelierTypes'
import type { W3Block } from './W3Sections'
import { AtelierStoryShare, type RideStory } from './AtelierStoryShare'
import { formatValue } from './atelierRideData'
import { ATELIER_SAMPLES, ATELIER_FTP } from './atelierRideFixture'
import { ATELIER_CONTRIBUTIONS } from './atelierRideFixture'
import { ATELIER_COACH } from './atelierCoachFixture'
import './w3RideAtelier.css'
import './w3RideAtelierViewport.css'

const n = (v:number) => v.toLocaleString('de-DE',{maximumFractionDigits:1})
// Demonstration best-effort records. These are separate from the downsampled illustrative stream.
export const ATELIER_RANKS:W3RideVm['ranks']=[...FIXTURE.ranks,...[
 [1,'1 SEK',1410,1390],[10,'10 SEK',1042,1090],[15,'15 SEK',961,990],[30,'30 SEK',780,815],
 [120,'2 MIN',438,450],[180,'3 MIN',382,391],[600,'10 MIN',292,299],
].map(([seconds,label,value,best])=>{const w=Number(value),b=Number(best);return {durationSeconds:Number(seconds),dur:String(label),watts:`${n(w)} W`,bestWatts:`${n(b)} W`,wattsValue:w,bestWattsValue:b,note:`${w-b>0?'+':''}${n(w-b)} W`,pr:w>b,fill:Math.min(1,w/b)}})].sort((a,b)=>a.durationSeconds-b.durationSeconds)

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
 return <main className="atelier-preview" style={tokens}><div className="atelier-preview-controls"><span>Vorschau · Beispieldaten</span><div><button type="button" aria-pressed={screen==='ride'} onClick={()=>setScreen('ride')}>Fahrt</button><button type="button" aria-pressed={screen==='today'} onClick={()=>setScreen('today')}>Heute</button></div></div>{screen==='ride'?<RideAtelier vm={{...FIXTURE,ranks:ATELIER_RANKS}} review={REVIEW} rideDate="2026-09-21T09:12:00" contributions={ATELIER_CONTRIBUTIONS} coachData={ATELIER_COACH} samples={ATELIER_SAMPLES} ftp={280} hrMax={190} ftpEntries={ATELIER_FTP} demo onBack={()=>{window.location.href="/e/w3-ride-preview"}}/>:<TodayAtelier/>}<aside className="atelier-references"><a href="https://www.awwwards.com/sites/radian" target="_blank" rel="noreferrer">Radian / Awwwards ↗</a><a href="https://tideguide.com/" target="_blank" rel="noreferrer">Tide Guide ↗</a><a href="https://developer.apple.com/design/awards/" target="_blank" rel="noreferrer">Apple Design Awards ↗</a></aside></main>
}

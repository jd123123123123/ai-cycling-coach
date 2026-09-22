import { lazy, Suspense, useId, useState, type ReactNode, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, Check, Clock3, Mountain, Route, X, Info, Share2 } from 'lucide-react'
import W3TopBar from './W3TopBar'
import { T, FONT } from './w3tokens'
import { W3_MAP } from './w3map'
import W3RideBestEfforts from './W3RideBestEfforts'
import { AtelierExplanation } from './AtelierExplanation'
import type { TrainingReview } from '../../api/trainingReview'
import type { W3RideVm } from './rideAtelierTypes'
import { AtelierPlot, AtelierRideAnalysis, AtelierFTPHistory } from './AtelierRideAnalysis'
import { AtelierStoryShare, type RideStory } from './AtelierStoryShare'
import { ftpWindow, ftpPlot, ridePlot, rideMean, METRICS, formatValue, elapsed, type RideMetric, type PlotModel, type FTPEntry, type RideSample } from './atelierRideData'
import { contributionAfter, contributionValue, planComparisonPlot, CoachRead, RideContributionView, RouteElevation, TrainingEmphasis, trainingEmphasis, type ContributionKey, type RideContributions } from './AtelierRideMeaning'
import { AtelierZoneTracks } from './AtelierZoneTracks'
import { coachEvidence, type CoachEvidence } from './atelierCoachData'
import './w3RideAtelier.css'
import './w3RideAtelierViewport.css'

import './w3RideReport.css'
const n = (v:number) => v.toLocaleString('de-DE',{maximumFractionDigits:1})
const zoneMinutes = (seconds:number) => formatValue(seconds/60,Math.abs(seconds)<600?1:0)
const nav = ['Fahrt','Zonen','Analyse','Bestwerte','Plan','Beitrag','Coach'] as const
const RouteMap = lazy(() => import('../../components/crew/RouteMap'))
type Panel = typeof nav[number] | 'Coach'
export type RideAtelierVm = Pick<W3RideVm, 'title'|'ranks'|'polyline'|'bigStat'|'bigStatUnit'|'climb'|'avgSpeed'> & {hero:Pick<W3RideVm['hero'],'dateLine'|'duration'>}
export const atelierTokens = () => ({'--a-bg':T.bg,'--a-surface':T.surface,'--a-soft':T.surface2,'--a-ink':T.ink,'--a-mid':T.mid,'--a-acid':T.acid,'--a-rule':T.rule,'--report-ink':T.ink,'--report-mid':T.mid,'--report-acid':T.acid,'--report-line':T.rule,'--report-bg':T.bg,fontFamily:FONT} as CSSProperties)
export interface RideAtelierProps {vm:RideAtelierVm;review:TrainingReview;rideDate:string;contributions?:RideContributions;coachData?:CoachEvidence;samples:RideSample[];ftp:number|null;hrMax:number|null;ftpEntries:FTPEntry[];demo?:boolean;onBack:()=>void;onExpandMap?:()=>void;detailsExtra?:ReactNode}
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

/** Use the same geographic map as the full-screen ride view; retain GPS while tiles load. */
function RideRouteMap({points,onOpen}:{points:[number,number][];onOpen?:()=>void}){
 const [paintedPoints,setPaintedPoints]=useState<[number,number][]|null>(null)
 const ready=paintedPoints===points
 return <div className="atelier-map-surface" data-ready={ready}>
  <Suspense fallback={null}><RouteMap polyline={points} styleKey="dark" interactive={false}
   palette={W3_MAP} lineColor={T.acid} lineWidth={4} startColor={T.ink} endColor={T.acid}
   fitPadding={28} refitOnResize attributionBottom={6} onReady={()=>setPaintedPoints(points)}/></Suspense>
  {!ready&&<div className="atelier-map-fallback"><RouteObject points={points}/></div>}
  <button type="button" className="atelier-map-open" aria-label="Karte öffnen" onClick={onOpen} disabled={!onOpen}/>
 </div>
}

/** Aligned inner/outer arcs compare recommended and actual minutes on one scale. */
export function ZoneDial({review,selected:controlled,onSelect}:{review:TrainingReview;selected?:number|null;onSelect?:(i:number)=>void}){
 const zones=review.zones.map((z,i)=>({...z,index:i})).filter(z=>(z.actual_seconds??0)>0||Boolean(review.planned_title&&(z.planned_seconds??0)>0))
 const [selected,setSelected]=useState<number|null>(null)
 const total=zones.reduce((sum,z)=>sum+(z.actual_seconds??0),0)
 const dominant=zones.reduce((a,b)=>(a?.actual_seconds??0)>(b.actual_seconds??0)?a:b,zones[0])
 const active=zones.find(z=>z.index===(controlled===undefined?selected:controlled))??dominant
 const id=useId()
 if(!total||!active)return <p className="atelier-empty">Keine Leistungsbereiche aufgezeichnet.</p>
 const actual=active.actual_seconds
 const percent=actual==null?null:Math.round(actual/total*100)
 const planned=review.planned_title?active.planned_seconds:null
 const difference=planned==null||actual==null?null:actual-planned
 const hasPlan=Boolean(review.planned_title&&review.zones.some(z=>z.planned_seconds!=null))
 return <>
  <div className="atelier-zone-ring-key"><span><i/>Gefahren</span>{hasPlan&&<span><i/>Empfohlen</span>}</div>
  <div className="atelier-dial">
   <svg viewBox="0 0 360 350" role="img" aria-label={actual==null?`${active.label}: keine Messung`:`${active.label}: ${zoneMinutes(actual)} Minuten, ${percent} Prozent der gemessenen Zonenzeit`}>
    <defs><linearGradient id={id} x1="0" x2=".7" y1="0" y2="1"><stop stopColor={T.acidLite}/><stop offset="1" stopColor={T.acidDeep}/></linearGradient></defs>
    <circle cx="180" cy="172" r="140" fill="none" stroke={T.rule}/>
    {Array.from({length:60},(_,i)=>{const a=i*Math.PI/30;return <line key={i} x1={180+Math.sin(a)*149} y1={172-Math.cos(a)*149} x2={180+Math.sin(a)*(i%5?152:157)} y2={172-Math.cos(a)*(i%5?152:157)} stroke={i%5?T.heroOff:T.mid} strokeWidth="1"/>})}
    <AtelierZoneTracks actual={review.zones.map(z=>z.actual_seconds)} planned={hasPlan?review.zones.map(z=>z.planned_seconds):undefined} selected={active.index} color={`url(#${id})`}/>

   </svg>
   <div className="atelier-dial-reading" aria-live="polite"><span>{active.label}</span><strong key={active.label}>{actual==null?'—':zoneMinutes(actual)}<small>min</small></strong><span>{actual==null?'Messung fehlt':planned!=null?`${zoneMinutes(planned)} min empfohlen`:`${percent} % deiner Zonenzeit`}</span></div>
  </div>
  <div className="atelier-zone-select" role="group" aria-label="Leistungsbereich wählen">{zones.map(z=><button type="button" key={z.index} aria-pressed={active.index===z.index} aria-label={`Zone ${z.index+1}: ${z.label}`} onClick={()=>{setSelected(z.index);onSelect?.(z.index)}}><span>Z{z.index+1}</span><i style={{height:`${8+(z.actual_seconds??0)/total*38}px`}}/></button>)}</div>
  {planned!=null?<div className="atelier-zone-compare"><div><span>Empfohlen <strong>{zoneMinutes(planned)} min</strong></span><strong>{difference==null?'—':`${difference>0?'+':''}${zoneMinutes(difference)} min`}<span>{difference==null?'Messung fehlt':difference===0?'wie geplant':difference>0?'mehr als geplant':'weniger als geplant'}</span></strong></div></div>:<p className="atelier-zone-context">Zeit im gemessenen Leistungsbereich.</p>}
 </>
}

export function PlanConsequence({review,rideDate,samples,ftp}:{review:TrainingReview;rideDate:string;samples?:RideSample[];ftp?:number}){
 const historical = new Date(rideDate).toDateString() !== new Date().toDateString()
 const change=review.changes[0]
 const duration=review.pairs.find(p=>p.label==='Dauer')
 const load=review.pairs.find(p=>p.unit==='TSS')
 const saved=Boolean(review.planned_title)
 const delta=saved&&load?.actual!=null&&load.planned!=null?load.actual-load.planned:null
 const longer=saved&&duration?.actual!=null&&duration.planned!=null&&duration.actual>duration.planned
 const applied=review.adaptation?.state==='adapted'
 const model=planComparisonPlot(review,samples,ftp)
 const [inspected,setInspected]=useState<number|null>(null)
 const actualPoints=model?.series[0].points??[],chosen=inspected==null?null:actualPoints[inspected]
 const end=Math.max(1,...(samples??[]).map(p=>p.seconds),...review.trace.map(p=>p.at_s))
 const inspectedTime=chosen?chosen.x*end:null
 const plannedPoint=inspectedTime==null?null:[...review.trace].filter(p=>p.at_s<=inspectedTime).sort((a,b)=>a.at_s-b.at_s).at(-1)
 return <div className="atelier-plan">
  <div className="atelier-panel-title"><span>Plan & Wirklichkeit</span><h2>{longer?'Länger als geplant.':delta!=null&&delta>0?'Mehr Belastung als geplant.':review.status==='matched'?'Dein Plan, umgesetzt.':'Deine Fahrt im Plan.'}</h2></div>
  <div className="atelier-recommendation"><strong>{review.planned_title?`Plan: ${review.planned_title}`:'Keine Empfehlung gespeichert'}</strong></div>
  {model?<div className="atelier-plan-visual"><div className="atelier-plan-readings">{saved&&<div><span><i className="is-planned"/>Plan</span><strong>{formatValue(chosen?(saved?plannedPoint?.planned_pct:null):saved?load?.planned:null)}<small>{chosen?'% FTP':'TSS'}</small></strong></div>}<div><span><i/>Gefahren</span><strong>{formatValue(chosen?chosen.y:load?.actual)}<small>{chosen?'% FTP':'TSS'}</small></strong></div></div><AtelierPlot model={{...model,marker:chosen?{...chosen,color:T.acid}:undefined}} label="Gefahrene und geplante Leistung über die Fahrzeit in Prozent FTP" onInspect={x=>{const points=model.series[0].points;setInspected(points.reduce((best,p,i)=>p&&Math.abs(p.x-x)<Math.abs((points[best]?.x??0)-x)?i:best,0))}}/>
   <div className="atelier-plan-deltas">{chosen?<button onClick={()=>setInspected(null)}>Gesamtvergleich anzeigen</button>:<><span>{duration?.actual!=null&&duration.planned!=null&&saved?`${duration.actual-duration.planned>0?'+':''}${n(duration.actual-duration.planned)} min`:'Dauer ohne Planvergleich'}</span><span>{delta!=null?`${delta>0?'+':''}${n(delta)} TSS`:'Belastung ohne Planvergleich'}</span></>}</div>
  </div>:<div className="atelier-comparison-rows">{[duration,load].filter(p=>p?.actual!=null).map(p=>{
   const planned=saved?p!.planned:null,max=Math.max(1,p!.actual!,planned??0),diff=planned==null?null:p!.actual!-planned
   return <div className="atelier-comparison-row" key={p!.label}><header><span>{p!.unit==='TSS'?'Belastung':p!.label}</span><strong>{diff==null?'':`${diff>0?'+':''}${n(diff)} ${p!.unit}`}</strong></header>
    {planned!=null&&<div className="atelier-paired-bar"><span>Plan</span><i><b style={{width:`${planned/max*100}%`}}/></i><strong>{n(planned)} <small>{p!.unit}</small></strong></div>}
    <div className="atelier-paired-bar is-actual"><span>Gefahren</span><i><b style={{width:`${p!.actual!/max*100}%`}}/></i><strong>{n(p!.actual!)} <small>{p!.unit}</small></strong></div>
   </div>
  })}</div>}
  {change?<div className="atelier-plan-action"><span>{applied?(review.adaptation?.automatic?'Automatisch angepasst':'Plan angepasst'):'Vorgeschlagene Anpassung'}{applied&&<Check size={15}/>}</span><div><time dateTime={change.date}>{new Date(`${change.date}T12:00:00`).toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short'})}</time><del>{change.before}</del></div><strong>{change.after}</strong><p>{change.reason}</p></div>:<p className="atelier-empty">{historical?'Keine Änderung dieser Fahrt zugeordnet.':review.adaptation?.reason??'Keine Änderung dieser Fahrt zugeordnet.'}</p>}
 </div>
}

export function RideAtelier({vm,review,rideDate,contributions,coachData,samples,ftp,hrMax,ftpEntries,demo=false,onBack,onExpandMap,detailsExtra}:RideAtelierProps){
 const [panel,setPanel]=useState<Panel>(()=>{const requested=new URLSearchParams(window.location.search).get('panel');return requested==='Coach'?'Coach':requested==='Leistung'?'Analyse':nav.find(p=>p===requested)??'Fahrt'}),[details,setDetails]=useState(false)
 const reduce=useReducedMotion()
 const [metric,setMetric]=useState<RideMetric>(()=>METRICS.find(m=>m.key===new URLSearchParams(window.location.search).get('metric'))?.key??'power'),[sample,setSample]=useState<number|null>(null),[sharing,setSharing]=useState(false)
 const [bestMode,setBestMode]=useState<'efforts'|'ftp'>(()=>new URLSearchParams(window.location.search).get('view')==='ftp'?'ftp':'efforts'),[days,setDays]=useState(90),[ftpIndex,setFtpIndex]=useState<number|null>(null),[effort,setEffort]=useState(300),[selectedZone,setSelectedZone]=useState<number|null>(null)
 const [contribution,setContribution]=useState<ContributionKey>('distance')
 const actualZoneSeconds=review.zones.map(z=>z.actual_seconds??0)
 const analysisReview=review
 const history=ftpWindow(ftpEntries,days,contributions?.rideDate??rideDate.slice(0,10))
 const record=vm.ranks.find(r=>r.pr&&r.bestWattsValue!=null&&r.wattsValue>r.bestWattsValue)
 const duration=review.pairs.find(p=>p.label==='Dauer')?.actual

 const config=METRICS.find(m=>m.key===metric)!,point=sample==null?null:samples[sample]
 const currentEffort=vm.ranks.find(r=>r.durationSeconds===effort)??record??vm.ranks[0]
 const sorted=[...vm.ranks].sort((a,b)=>a.durationSeconds-b.durationSeconds)
 const minDuration=Math.log(sorted[0]?.durationSeconds??1),maxDuration=Math.log(sorted.at(-1)?.durationSeconds??2)
 const effortX=(d:number)=>sorted.length===1 ? .5 :(Math.log(d)-minDuration)/(maxDuration-minDuration)
 const effortPlot:PlotModel={marker:currentEffort?{x:effortX(currentEffort.durationSeconds),y:currentEffort.wattsValue,color:T.acid}:undefined,low:0,high:Math.max(1,...sorted.flatMap(r=>[r.wattsValue,r.bestWattsValue??0])),unit:'W',xLabels:[sorted[0]?.dur.toLowerCase()??'','',sorted.at(-1)?.dur.toLowerCase()??''],series:[{color:T.mid,dashed:true,points:sorted.map(r=>r.bestWattsValue==null?null:{x:effortX(r.durationSeconds),y:r.bestWattsValue})},{color:T.acid,points:sorted.map(r=>({x:effortX(r.durationSeconds),y:r.wattsValue}))}]}
 let story:RideStory={title:vm.title,eyebrow:'Ausfahrt abgeschlossen',value:vm.bigStat,unit:vm.bigStatUnit,caption:`Trainingsreiz: ${trainingEmphasis(analysisReview.zones).title}`,date:vm.hero.dateLine.split(' · ')[0],demo,routePath:vm.polyline?routeSilhouette(vm.polyline):undefined,plot:ridePlot(samples,'altitude',null,null),facts:[{label:'Fahrzeit',value:vm.hero.duration},{label:'Höhenmeter',value:vm.climb},{label:'Ø Tempo',value:vm.avgSpeed}]}
 if(panel==='Analyse')story={...story,routePath:undefined,title:config.label,eyebrow:vm.title,value:formatValue(point?point[metric]:metric==='altitude'?(samples.some(s=>s.altitude!=null)?Math.max(...samples.map(s=>s.altitude??-Infinity)):null):rideMean(samples,metric),metric==='speed'?1:0),unit:config.unit,caption:point?`Bei ${elapsed(point.seconds)} h / ${formatValue(point.distance==null?null:point.distance/1000,1)} km`:metric==='altitude'?'Höchster aufgezeichneter Punkt':'Zeitgewichteter Fahrtdurchschnitt',plot:ridePlot(samples,metric,sample,ftp,hrMax),facts:[{label:'FTP zur Fahrt',value:`${formatValue(ftp)} W`},{label:'Fahrzeit',value:vm.hero.duration},{label:'Distanz',value:`${vm.bigStat} km`}]}
 if(panel==='Bestwerte'&&bestMode==='efforts'&&currentEffort)story={...story,routePath:undefined,title:currentEffort.pr?'Ein neuer Bestwert.':'Deine Leistung.',eyebrow:`${currentEffort.dur} / ${vm.title}`,value:formatValue(currentEffort.wattsValue),unit:'W',caption:currentEffort.bestWattsValue==null?'Kein früherer Vergleich':`Bisher ${formatValue(currentEffort.bestWattsValue)} W / ${currentEffort.wattsValue-currentEffort.bestWattsValue>0?'+':''}${formatValue(currentEffort.wattsValue-currentEffort.bestWattsValue)} W`,plot:effortPlot,facts:[{label:'Leistungsdauer',value:currentEffort.dur},{label:'Distanz',value:`${vm.bigStat} km`},{label:'Fahrzeit',value:vm.hero.duration}]}
 if(panel==='Bestwerte'&&bestMode==='ftp'){const active=history[ftpIndex??history.length-1],first=history[0],last=history.at(-1);story={...story,routePath:undefined,title:'Dein FTP-Verlauf.',eyebrow:`FTP / ${days} Tage`,value:formatValue(active?.watts),unit:'W',caption:active?`${active.source} am ${active.date}`:'Keine Messungen',plot:ftpPlot(history,ftpIndex),facts:[{label:'Erster Wert',value:`${formatValue(first?.watts)} W`},{label:'Letzter Wert',value:`${formatValue(last?.watts)} W`},{label:'Veränderung',value:history.length>1?`${last!.watts-first.watts>0?'+':''}${formatValue(last!.watts-first.watts)} W`:'—'}]}}
 if(panel==='Plan'){const load=review.pairs.find(p=>p.unit==='TSS'),delta=load?.actual!=null&&load.planned!=null&&review.planned_title?load.actual-load.planned:null;story={...story,routePath:undefined,title:'Deine Fahrt im Plan.',eyebrow:vm.title,value:delta==null?'—':`${delta>0?'+':''}${formatValue(delta)}`,unit:'TSS',caption:'Lime: gefahren / gestrichelt: Plan',plot:planComparisonPlot(review,samples,ftp??undefined)??undefined,facts:[{label:'Gefahren',value:`${formatValue(load?.actual)} TSS`},{label:'Empfohlen',value:`${formatValue(load?.planned)} TSS`},{label:'Planfolge',value:review.changes[0]?.after??'Keine Änderung'}]}}
 if(panel==='Beitrag') {const current=contributions?.metrics.find(m=>m.key===contribution);story={...story,routePath:undefined,plot:undefined,title:'Diese Fahrt zählt.',eyebrow:contributions?.period??'Dein Beitrag',value:current?.added==null?'—':`+${contributionValue(current.added,current.key)}`,unit:current?.unit??'',caption:current?`${current.label} dazu`:'Noch keine Jahreswerte verfügbar',contribution:current?{before:contributionValue(current.before,current.key),after:contributionValue(contributionAfter(current),current.key),unit:current.unit,share:contributionAfter(current)!=null&&contributionAfter(current)!>0?current.added!/contributionAfter(current)!:null}:undefined,contributionData:contributions?{data:contributions,selected:contribution}:undefined,facts:contributions?.metrics.map(m=>({label:m.label,value:m.added==null?'—':`+${contributionValue(m.added,m.key)} ${m.unit}`}))??[]}}
 if(panel==='Zonen'&&analysisReview.zones.length&&actualZoneSeconds.some(s=>s>0)){const total=actualZoneSeconds.reduce((s,n)=>s+n,0),index=selectedZone??actualZoneSeconds.indexOf(Math.max(...actualZoneSeconds));story={...story,routePath:undefined,plot:undefined,title:analysisReview.zones[index].label,eyebrow:'Dein Trainingsreiz',value:formatValue(actualZoneSeconds[index]/60),unit:'min',caption:`${formatValue(actualZoneSeconds[index]/total*100)} % deiner Zonenzeit`,zoneRing:{seconds:actualZoneSeconds,planned:review.planned_title?analysisReview.zones.map(z=>z.planned_seconds):undefined,selected:index},facts:[{label:'Fahrzeit',value:vm.hero.duration},{label:'FTP zur Fahrt',value:`${formatValue(ftp)} W`},{label:'Empfohlen',value:analysisReview.zones[index].planned_seconds==null?'—':`${formatValue(analysisReview.zones[index].planned_seconds!/60)} min`}]}}
 if(panel==='Coach'){const insight=coachData?coachEvidence(coachData,analysisReview):null,p=coachData?.debrief?.pacing;story={...story,routePath:undefined,title:insight?.pacingTitle??'Deine Fahrt analysiert.',eyebrow:'Coach-Read',value:insight?.split==null?'—':`${insight.split>0?'+':''}${formatValue(insight.split,1)}`,unit:'% NP',caption:'Zweite Hälfte gegenüber erster Hälfte / Terrain berücksichtigen',plot:undefined,comparisons:p?[{label:'Normalisierte Leistung',actual:p.second_half_np,planned:p.first_half_np,unit:'W',labels:['Erste Hälfte','Zweite Hälfte']}]:undefined,facts:[{label:'Erste Hälfte',value:`${formatValue(p?.first_half_np)} W`},{label:'Zweite Hälfte',value:`${formatValue(p?.second_half_np)} W`},{label:'HF-Drift',value:`${formatValue(insight?.drift,1)} %`}]}}

 return <article className="atelier-device">
  <W3TopBar title={vm.hero.dateLine.split(' · ')[0]} showAvatar={false} onBack={panel==='Coach'?()=>setPanel('Fahrt'):onBack} extra={<><button type="button" aria-label="Diese Ansicht teilen" onClick={()=>setSharing(true)}><Share2 size={20}/></button><button type="button" onClick={()=>setDetails(!details)} aria-expanded={details} aria-label={details?'Details schließen':'Fahrtdetails öffnen'}>{details?<X size={20}/>:<Info size={20}/>}</button></>}/>

  <div className="atelier-story" onTouchStart={e=>{e.currentTarget.dataset.touch=String(e.touches[0].clientX);e.currentTarget.dataset.touchY=String(e.touches[0].clientY)}} onTouchEnd={e=>{if(panel==='Coach'||(e.target as Element).closest('svg,input,button'))return;const diff=e.changedTouches[0].clientX-Number(e.currentTarget.dataset.touch);if(Math.abs(diff)>70&&Math.abs(diff)>Math.abs(e.changedTouches[0].clientY-Number(e.currentTarget.dataset.touchY))){const i=nav.indexOf(panel);setPanel(nav[Math.max(0,Math.min(nav.length-1,i+(diff<0?1:-1)))])}}}>
   <AnimatePresence mode="wait" initial={false}><motion.div key={panel} className={`atelier-story-panel atelier-story-${panel}`} initial={reduce?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={reduce?undefined:{opacity:0,y:-8}} transition={{duration:.22}}>
    {panel==='Fahrt'&&<>
     <div className="atelier-panel-title"><span>Ausfahrt abgeschlossen</span><h1>{vm.title}</h1></div>
     <div className="atelier-distance"><strong>{vm.bigStat}</strong><span>{vm.bigStatUnit}</span><button className="atelier-ftp-anchor" aria-label={`FTP ${formatValue(ftp)} Watt. FTP-Verlauf öffnen`} onClick={()=>{setBestMode('ftp');setPanel('Bestwerte')}}><span>FTP <ArrowUpRight size={13}/></span><strong>{formatValue(ftp)}<small> W</small></strong></button></div>
     {vm.polyline&&vm.polyline.length>1?<RideRouteMap points={vm.polyline} onOpen={onExpandMap}/>:<p className="atelier-empty">Keine GPS-Route aufgezeichnet.</p>}
     <RouteElevation samples={samples} onOpen={()=>{setMetric('altitude');setPanel('Analyse')}}/>
     <div className="atelier-ride-facts"><div><Clock3 size={17}/><strong>{duration==null?vm.hero.duration:`${Math.floor(duration/60)}h ${Math.round(duration%60)}min`}</strong><span>Fahrzeit</span></div><div><Mountain size={18}/><strong>{vm.climb}</strong><span>Höhenmeter</span></div><div><Route size={17}/><strong>{vm.avgSpeed}</strong><span>Ø Tempo</span></div></div>
     <TrainingEmphasis review={analysisReview} onAnalyse={()=>setPanel('Zonen')}/>
    </>}
    {panel==='Zonen'&&<><div className="atelier-panel-title"><span>Leistungszonen</span><h2>Dein Trainingsreiz.</h2></div><ZoneDial review={analysisReview} selected={selectedZone} onSelect={setSelectedZone}/></>}
    {panel==='Analyse'&&<AtelierRideAnalysis samples={samples} metric={metric} selected={sample} ftp={ftp} hrMax={hrMax} onMetric={setMetric} onSelect={setSample}/>}
    {panel==='Bestwerte'&&<><div className="atelier-best-mode" aria-label="Leistungsentwicklung auswählen"><button aria-pressed={bestMode==='efforts'} onClick={()=>setBestMode('efforts')}>Bestwerte der Fahrt</button><button aria-pressed={bestMode==='ftp'} onClick={()=>setBestMode('ftp')}>FTP-Trend</button></div>{bestMode==='efforts'?<><div className="atelier-panel-title"><h2>Deine Bestwerte.</h2></div><W3RideBestEfforts ranks={vm.ranks} selectedDuration={effort} onSelectDuration={setEffort}/>{!vm.ranks.length&&<p className="atelier-empty">Noch keine vergleichbaren Leistungswerte.</p>}</>:<AtelierFTPHistory entries={history} days={days} selected={ftpIndex} onDays={n=>{setDays(n);setFtpIndex(null)}} onSelect={setFtpIndex}/>}</>}
    {panel==='Plan'&&<PlanConsequence review={analysisReview} rideDate={rideDate} samples={samples} ftp={ftp??undefined}/>}
    {panel==='Coach'&&<CoachRead review={analysisReview} data={coachData} onPlan={()=>setPanel('Plan')} onFTP={()=>{setBestMode('ftp');setPanel('Bestwerte')}}/>}
    {panel==='Beitrag'&&<RideContributionView data={contributions??{period:'Dein Beitrag',metrics:[]}} selected={contribution} onSelect={setContribution}/>}
   </motion.div></AnimatePresence>
  </div>
  <nav className="atelier-chapter-nav" aria-label="Fahrtrückblick wählen">{nav.map(p=><button type="button" key={p} aria-pressed={p===panel} onClick={()=>setPanel(p)}>{p}{p===panel&&<motion.i layoutId="atelier-panel" transition={{duration:reduce?0:.25}}/>}</button>)}</nav>
  {sharing&&<AtelierStoryShare story={story} onClose={()=>setSharing(false)}/>}
  <AtelierExplanation title="Fahrtdetails" open={details} onClose={()=>setDetails(false)}><p><strong>{vm.title}</strong><br/>{vm.hero.dateLine}<br/>{vm.bigStat} {vm.bigStatUnit} · {vm.climb}<br/>{vm.hero.duration} Fahrzeit</p><p>{review.summary}</p><p>{review.method}</p><p>{review.limitations.join(' ')||'Die Auswertung beruht auf den vorhandenen Aufzeichnungen.'}</p>{detailsExtra&&<div>{detailsExtra}</div>}</AtelierExplanation>
 </article>
}

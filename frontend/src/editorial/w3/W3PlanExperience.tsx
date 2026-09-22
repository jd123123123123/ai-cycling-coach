import {useEffect,useId,useRef,useState,type CSSProperties,type ReactNode} from 'react'
import {useNavigate} from 'react-router-dom'
import {ArrowRight,ArrowUpRight,Check,Flag,SlidersHorizontal,X,HelpCircle,History,Upload,Activity,Route,Clock3,Bike} from 'lucide-react'
import {motion,useReducedMotion} from 'motion/react'
import {T,FONT} from './w3tokens'
import W3TopBar from './W3TopBar'
import W3TabBar from './W3TabBar'
import {PlanAdjustSheet,type W3PlanVm,type W3PlanActions} from './W3PlanView'
import {usePlanAdaptations} from '../../hooks/usePlanAdaptations'
import W3AdaptationReceipt from './W3AdaptationReceipt'
import W3PlanFocus from './W3PlanFocus'
import W3PlanDayComparison from './W3PlanDayComparison'
import W3PlanHistory from './W3PlanArchiveSheet'
import type {PlanHistoryDetail} from '../../api/planHistory'
import {useProgressExplorer,W3ProgressAnalyticsView} from './W3ProgressAnalytics'
import W3PlanIntro from './W3PlanIntro'
import W3PowerProfile from './W3PowerProfile'
import W3PlanGoalComposer from './W3PlanGoalComposer'
import type {GoalFocus} from '../../api/planGoal'
import type {ProgressExplorer} from '../../api/progressExplorer'
import './w3PlanExperience.css'

type State='empty'|'created'|'active'|'ended'
export function PlanDialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[])
 return <dialog className="w3-plan-dialog" ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}><header><h2>{title}</h2><button aria-label="Schließen" onClick={onClose}><X size={20}/></button></header>{children}</dialog>
}
function GoalArt({goal}:{goal:string}){
 const id=useId(),reduced=useReducedMotion()
 const bars=goal==='ftp'?[35,50,70,46,88,113,76,134,152]:goal==='vo2'?[32,47,82,117,89,141,166,111,70]:[64,75,81,85,86,85,83,80,76]
 return <svg viewBox="0 0 340 210" aria-hidden="true"><defs><linearGradient id={id} x2=".8" y2="1"><stop stopColor={T.acidLite}/><stop offset=".35" stopColor={T.acid}/><stop offset="1" stopColor={T.acidDeep}/></linearGradient></defs><ellipse cx="205" cy="187" rx="125" ry="15" fill={T.bg}/>{bars.map((h,i)=><motion.g key={i} initial={false} animate={{y:183-h}} transition={{duration:reduced?0:.45,delay:reduced?0:i*.025}}><rect x={50+i*28} width="20" height={h} rx="7" fill={i<2?T.surface2:`url(#${id})`}/><rect x={52+i*28} y="2" width="16" height="4" rx="2" fill={T.ink} opacity={i<2?.05:.45}/></motion.g>)}</svg>
}
/** Die Beschriftung nennt Soll und Ist getrennt und erfindet nichts. Ohne
 *  Fahrt heisst es "nicht gefahren", nicht "0 TSS gefahren" -- eine Null ist
 *  eine Messung, eine Luecke ist keine. */
function vesselLabel(b:{idx:number;planned:number;actual:number|null;over:boolean}){
 const soll=`Woche ${b.idx}: ${b.planned} TSS geplant`
 if(b.actual==null) return `${soll}, nicht gefahren`
 const pct=b.planned>0?Math.round(b.actual/b.planned*100):null
 return `${soll}, ${b.actual} TSS gefahren${pct!=null?` (${pct} %)`:''}${b.over?', ueber dem Ziel':''}`
}
/** Das Gefaess: Hoehe = geplante Last, Fuellung = gefahrene. Leer heisst leer. */
function Vessel({b,max,animate,reduced}:{b:{planned:number;fill:number|null;over:boolean};max:number;animate:boolean;reduced:boolean|null}){
 const h=max>0?Math.max(8,b.planned/max*100):8
 const fill=b.fill==null?null:`${Math.max(4,b.fill*100)}%`
 return <span className="w3-plan-vessel-slot"><span className="w3-plan-vessel" data-over={b.over||undefined} style={{height:`${h}%`}}>
  {fill!=null&&(animate
    ?<motion.i initial={false} animate={{height:fill}} transition={{duration:reduced?0:.35}}/>
    :<i style={{height:fill}}/>)}
 </span></span>
}

export default function W3PlanExperience({vm,state,userId,onRebuild,onOpenSession,onCreatedDone,weekOffset,onWeekOffset,planEnd,planStart,goalDate,initialCompose=false,onComposeClose,onCancelPlan,priorPlanCompleted=false,priorPlanEnd=null,loading=false,previewProgress,previewHistory}:{vm:W3PlanVm;state:State;userId?:number;onRebuild:W3PlanActions['onRebuild'];onOpenSession:(iso:string)=>void;onCreatedDone:()=>void;planEnd?:string|null;planStart?:string|null;initialCompose?:boolean;onComposeClose?:()=>void;onCancelPlan?:()=>Promise<void>;priorPlanCompleted?:boolean;priorPlanEnd?:string|null;goalDate?:string|null;weekOffset:number;onWeekOffset:(offset:number)=>void;loading?:boolean;previewProgress?:ProgressExplorer;previewHistory?:PlanHistoryDetail[]}){
 const nav=useNavigate(),reduced=useReducedMotion()
 const [view,setView]=useState<'plan'|'profile'>('plan'),[goal,setGoal]=useState('ftp'),[day,setDay]=useState(0),[sheet,setSheet]=useState<'adjust'|'adaptation'|'why'|'profile'|'progress'|'history'|'archive'|null>(null),[intro,setIntro]=useState(false)
 const [compose,setCompose]=useState<GoalFocus|'choose'|null>(initialCompose?'choose':null)
 const [skipAutoIntro,setSkipAutoIntro]=useState(initialCompose)
 // The invitation can change only the query string while this page is mounted.
 useEffect(()=>{if(initialCompose){setSkipAutoIntro(true);setCompose('choose')}},[initialCompose])
 const missingPlanHistory=state==='ended'&&!planStart
 const {data:adaptations}=usePlanAdaptations(14,8)
 const latest=adaptations?.adaptations[0]
 const [referenceDate,setReferenceDate]=useState<string|null>(null)
 const [period,setPeriod]=useState<import('../../api/progressExplorer').ProgressPeriod>(missingPlanHistory?'month':'plan')
 const results=useProgressExplorer(period,referenceDate,period==='plan'&&(state==='ended'||priorPlanCompleted)?(priorPlanCompleted?priorPlanEnd:planEnd):undefined)
 const progressData=previewProgress??results.data
 const ftpDelta=progressData?.ftp.current!=null&&progressData.ftp.baseline?.value!=null?progressData.ftp.current-progressData.ftp.baseline.value:null
 const vo2Delta=progressData?.vo2.current!=null&&progressData.vo2.baseline?.value!=null?progressData.vo2.current-progressData.vo2.baseline.value:null
 const ftpStart=progressData?.ftp.baseline?.value??null
 const ftpNow=progressData?.ftp.current??null
 const vo2Start=progressData?.vo2.baseline?.value??null
 const vo2Now=progressData?.vo2.current??null
 const recordWins=progressData?.records?.filter(r=>r.watts!=null&&r.previous_watts!=null&&r.watts>r.previous_watts).length??null
 const compareSeries=vm.finishAnalysis
 const planAdherence=Math.max(0,Math.min(100,compareSeries?.adherence??100))
 const compareMax=Math.max(1,...(compareSeries?.planned??[]),...(compareSeries?.actual??[]).map(v=>v??0))
 const curvePoints=(values:(number|null)[])=>values.map((value,i)=>value==null?null:`${10+(i/Math.max(1,values.length-1))*300},${78-(value/compareMax)*60}`).filter(Boolean).join(' ')
 const sessions=vm.daySessions??[]
 const identity=sessions.map(s=>s.dateISO).join(',')
 useEffect(()=>{setDay(Math.max(0,sessions.findIndex(s=>s.isToday)))},[identity])
 const selected=sessions[day]
 const title=vm.eventName==='Kein Ziel gesetzt'?'Dein Aufbauplan':vm.eventName
 const progress=Math.min(vm.totalWeeks,Math.max(1,vm.planWeekNum))
 // Die Skala ist die GEPLANTE Last. Sie haengt nicht daran, wie gefahren
 // wurde -- sonst verschoebe eine starke Woche rueckwirkend alle anderen.
 const max=Math.max(1,...vm.weekBars.map(b=>b.planned))
 const currentIndex=Math.max(0,vm.planWeekNum-1)
 const currentBar=currentIndex+weekOffset
 const hasWorkout=!!selected?.title
 const openSession=()=>{if(selected?.isPast){setSheet('history');return}if(selected?.dateISO&&hasWorkout)onOpenSession(selected.dateISO);else setSheet('why')}
 const styles={'--plan-acid':T.acid,'--plan-ink':T.ink,'--plan-bg':T.bg,'--plan-card':T.surface,'--plan-card-top':T.cardTop,'--plan-card-bot':T.cardBot,'--plan-acid-lite':T.acidLite,'--plan-on-acid':T.heroInk,'--plan-shadow':T.shadowSoft,'--plan-acid-dim':T.acidDim,'--plan-raised':T.surface2,'--plan-muted':T.mid,'--plan-stroke':T.stroke,fontFamily:FONT} as CSSProperties
 return <div className={`w3-plan-experience state-${state}${state==='active'&&view==='plan'?' focus-active':''}`} style={styles}>
 <W3TopBar title="Plan" extra={<button className="w3-plan-help" aria-label="So funktioniert dein Plan" onClick={()=>setIntro(true)}><HelpCircle size={18}/></button>}/>
 <main className="w3-plan-content">
 {state!=='empty'&&(state!=='active'||view==='profile')&&<div className="w3-plan-view-switch"><button aria-pressed={view==='plan'} onClick={()=>setView('plan')}>{state==='ended'?'Ergebnis':'Plan'}</button><button aria-pressed={view==='profile'} onClick={()=>setView('profile')}>Entwicklung</button><button className="focus-plan-archive" aria-label="Plan-Historie öffnen" onClick={()=>setSheet('archive')}><History size={20}/></button><button className="w3-plan-settings" aria-label="Zeit und Trainingstage anpassen" onClick={()=>setSheet('adjust')}><SlidersHorizontal size={19}/></button></div>}
 {state==='empty'?<>
 <h1>Was hast<br/>du vor?</h1>
 <button className="w3-plan-archive-empty" onClick={()=>setSheet('archive')}>Plan-Historie <History size={16}/></button><p className="w3-plan-empty-note">Noch kein abgeschlossener Plan. Lege jetzt deinen Fokus fest — dann zeigt dir RIDR, warum jede Einheit dort steht.</p>
 <section className="w3-plan-goal-art"><div><span>{goal==='ftp'?'FTP aufbauen':goal==='vo2'?'VO₂max aufbauen':'Ausdauer aufbauen'}</span><h2>{goal==='ftp'?<>Länger<br/>schnell fahren.</>:goal==='vo2'?<>Mehr Luft.<br/>Mehr Möglichkeiten.</>:<>Weiter als<br/>letztes Mal.</>}</h2></div><GoalArt goal={goal}/></section>
 <div className="w3-plan-goals">{[['ftp','FTP'],['hours','Ausdauer'],['vo2','VO₂max']].map(([key,label])=><button key={key} aria-pressed={goal===key} onClick={()=>setGoal(key)}>{label}{goal===key&&<Check size={15}/>}</button>)}</div>
 <button className="w3-plan-link" onClick={()=>setCompose('choose')}><Flag size={22}/><span><strong>Mehrere Schwerpunkte kombinieren</strong><span>Oder für ein Event trainieren</span></span><ArrowUpRight size={20}/></button>
 <button className="w3-plan-link" onClick={()=>nav('/plan/import')}><Upload size={22}/><span><strong>Du hast schon einen Plan?</strong><span>Trainingsplan importieren</span></span><ArrowUpRight size={20}/></button>
 <button className="w3-plan-primary" onClick={()=>setCompose(goal==='ftp'?'threshold':goal==='vo2'?'vo2':'endurance')}>Meinen Plan erstellen<ArrowRight size={20}/></button>
 </>:view==='profile'||state==='ended'?<>
 {state!=='ended'&&<div className="w3-plan-opening"><h1>{missingPlanHistory?<>Dein nächster<br/>Schritt.</>:<>Deine<br/>Entwicklung.</>}</h1><p>{missingPlanHistory?'Dein bisheriger Plan ist beendet. Wähle, was du als Nächstes verbessern möchtest.':title}</p></div>}
 {state==='active'&&<button className="w3-plan-link slim" onClick={()=>setSheet('profile')}>Leistungsprofil<ArrowUpRight size={18}/></button>}
 {missingPlanHistory&&<button className="w3-plan-primary" onClick={()=>setCompose('choose')}>Nächstes Ziel wählen<ArrowRight size={20}/></button>}
 {state==='ended'&&!missingPlanHistory&&<section className="w3-plan-finish-hero" aria-labelledby="w3-plan-finish-title">
   <div className="w3-plan-finish-topline"><span>DEIN PLAN · ERGEBNIS</span><span>{vm.totalWeeks} WOCHEN</span></div>
   <div className="w3-plan-finish-lead">
     <div className="w3-plan-finish-score" aria-label={`Plan zu ${planAdherence} Prozent umgesetzt`}>
       <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="49" className="w3-plan-finish-score-track"/><motion.circle cx="60" cy="60" r="49" className="w3-plan-finish-score-fill" initial={{pathLength:reduced?planAdherence/100:0}} animate={{pathLength:planAdherence/100}} transition={{duration:reduced?0:1.15,ease:[.22,1,.36,1]}}/></svg>
       <div><strong>{planAdherence}</strong><span>PROZENT<br/>UMGESETZT</span></div>
     </div>
     <div className="w3-plan-finish-lead-copy"><h2 id="w3-plan-finish-title">Stärker<br/><em>als am Start.</em></h2><p>{vm.totalWeeks} Wochen. Dein Körper kennt den Weg jetzt.</p></div>
   </div>
   <div className="w3-plan-finish-comparison" aria-label="Leistungsentwicklung seit Planstart">
     <div><span>FTP</span><strong>{ftpStart!=null&&ftpNow!=null?`${Math.round(ftpStart)} → ${Math.round(ftpNow)} W`:'—'}</strong><b>{ftpDelta!=null?`${ftpDelta>=0?'+':''}${Math.round(ftpDelta)} W`:'—'}</b></div>
     <div><span>VO₂MAX</span><strong>{vo2Start!=null&&vo2Now!=null?`${Math.round(vo2Start)} → ${Math.round(vo2Now)}`:'—'}</strong><b>{vo2Delta!=null?`${vo2Delta>=0?'+':''}${Math.round(vo2Delta)}`:'—'}</b></div>
     <div><span>REKORDE</span><strong>{recordWins!=null?recordWins:'—'}</strong><b>{recordWins!=null?'verbessert':'—'}</b></div>
   </div>
   {compareSeries&&<div className="w3-plan-finish-impact" aria-label="Plan-Soll und tatsächlich gefahrene Belastung">
     <div className="w3-plan-finish-impact-head"><span>PLANWIRKUNG</span><strong>{compareSeries.adherence!=null?`${compareSeries.adherence}% umgesetzt`:''}</strong></div>
     <svg viewBox="0 0 320 90" role="img" aria-label="Vergleich der geplanten und tatsächlichen Trainingsbelastung"><path d="M10 78H310M10 48H310M10 18H310" className="w3-plan-finish-impact-grid"/><polyline points={curvePoints(compareSeries.planned)} className="w3-plan-finish-impact-plan"/><polyline points={curvePoints(compareSeries.actual)} className="w3-plan-finish-impact-actual"/></svg>
     <div className="w3-plan-finish-impact-legend"><span><i data-plan/>Plan-Soll</span><span><i data-actual/>Dein Weg</span><small>Start → Abschluss</small></div>
     <p><strong>Was das verändert</strong> {compareSeries.impact}</p>
   </div>}
   {vm.finishStats&&<div className="w3-plan-finish-total-grid" aria-label="Gesamtleistung im Plan">
     <div><Activity size={14}/><strong>{vm.finishStats.tss}</strong><span>TSS</span></div><div><Route size={14}/><strong>{vm.finishStats.km}</strong><span>KM</span></div><div><Clock3 size={14}/><strong>{vm.finishStats.hours}</strong><span>STUNDEN</span></div><div><Bike size={14}/><strong>{vm.finishStats.rides}</strong><span>FAHRTEN</span></div>
   </div>}
   <button className="w3-plan-finish-detail-link" onClick={()=>setSheet('progress')}><span><strong>Leistungsprofil öffnen</strong><small>FTP · VO₂max · Rekorde · Zeiträume</small></span><ArrowUpRight size={17}/></button>
 </section>}
 {state!=='ended'&&<W3ProgressAnalyticsView availablePeriods={missingPlanHistory?['week','month','year']:undefined} data={progressData} period={period} onPeriod={p=>{setPeriod(p);setReferenceDate(null)}} referenceDate={referenceDate} onReferenceDate={setReferenceDate} pending={previewProgress?false:results.isPending} error={previewProgress?false:results.isError}/>} 
 {state==='ended'&&!missingPlanHistory&&<button className="w3-plan-primary" onClick={()=>setCompose('choose')}>Was baust du als Nächstes?<ArrowRight size={20}/></button>}
 </>:<>
 <header className="w3-plan-heading"><div><h1>{state==='created'?<>Dein Plan<br/>steht.</>:title}</h1>{(state!=='active'||goalDate)&&<p>{state==='created'
      ? 'Gespeichert · dein Weg ist klar'
      /* IM AKTIVEN ZUSTAND NUR DAS ZIEL. Hier stand
         "${phase} · ${planWeekLabel}" -- und genau das fuehrt der Bogen
         direkt darunter als seine Ueberschrift: "INTENSIV / WOCHE 05 /
         von 08". Zwei Zeilen Abstand, dieselbe Auskunft, zweimal.
         Das Ziel dagegen sagt der Bogen NICHT. */
      : (goalDate
          ? `Ziel ${new Date(goalDate+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'long'})}`
          /* OHNE ZIEL GAR NICHTS. Der Rueckfall lautete
             "${phase} · ${planWeekLabel}" -- also wieder die Auskunft des
             Bogens. Eine Zeile, die nichts Neues sagt, ist keine Zeile
             weniger wert als eine leere: sie kostet Platz UND liest sich
             wie ein Fehler ("warum steht das zweimal da?"). */
          : null)}</p>}</div>{/* KEINE WOCHENZAHL IM AKTIVEN ZUSTAND. Der Bogen darunter fuehrt
     "WOCHE 05 ... von 08" als seine Ueberschrift; oben stand dieselbe
     Auskunft ein zweites Mal als "05/08" -- dieselbe Tatsache in zwei
     verschiedenen typografischen Systemen auf einem Bildschirm.
     In `created` gibt es keinen Bogen, dort bleibt sie. */}
{state==='active'&&<div className="focus-plan-heading-actions"><button className="focus-plan-archive" aria-label="Plan-Historie öffnen" onClick={()=>setSheet('archive')}><History size={20}/></button><button className="focus-plan-adjust" aria-label="Zeit und Trainingstage anpassen" onClick={()=>setSheet('adjust')}><SlidersHorizontal size={19}/></button></div>}
{state!=='active'&&<div className="w3-plan-week-count">{String(progress).padStart(2,'0')}<span>/{String(vm.totalWeeks).padStart(2,'0')}</span></div>}</header>
 {state==='created'?<>
 <section className="w3-plan-overview">
   <div className="w3-plan-card-head"><strong>Dein Weg auf einen Blick</strong><span>{vm.totalWeeks} Wochen</span></div>
   <div className="w3-plan-overview-stats">
     <div><strong>{vm.totalWeeks}</strong><span>Wochen</span></div>
     <div><strong>{vm.daySessions?.filter(s=>s.title).length ?? vm.adjustDays.filter(Boolean).length}</strong><span>Einheiten / Woche</span></div>
     <div><strong>{vm.avgTss}</strong><span>Ø TSS / Woche</span></div>
   </div>
   <div className="w3-plan-overview-load">
     <div className="w3-plan-overview-load-head"><span>Belastung über den Plan</span><span>locker → intensiv</span></div>
     <div className="w3-plan-week-beams" role="img" aria-label={`Geplante Wochenlast: ${vm.weekBars.map(b=>`${b.planned}`).join(', ')} TSS`}>{vm.weekBars.map((b,i)=><Vessel key={i} b={b} max={max} animate={false} reduced={reduced}/>)}</div>
   </div>
 </section>
 <section className="w3-plan-development" aria-labelledby="w3-plan-development-title">
   <div className="w3-plan-card-head"><h2 id="w3-plan-development-title">Start → jetzt</h2><span>Was sich bewegt</span></div>
   <p className="w3-plan-development-note">Dein Leistungsprofil im Vergleich zum Planstart.</p>
   <W3PowerProfile data={progressData}/>
 </section>
 <section className="w3-plan-journey">
   <div className="w3-plan-card-head"><strong>Dein aktueller Block</strong><span>{vm.block?.weekOfBlock ?? vm.planWeekLabel}</span></div>
   <div className="w3-plan-block-summary"><strong>{vm.block?.phase ?? 'Grundlage'}</strong><span>{vm.block?.dateRange ?? vm.weekRangeLabel}</span></div>
   <div className="w3-plan-week-beams">{vm.weekBars.map((b,i)=><button key={i} aria-label={vesselLabel(b)} aria-pressed={currentBar===i} data-selected={currentBar===i} data-past={i<currentIndex} disabled={i-currentIndex>12} onClick={()=>onWeekOffset(i-currentIndex)}><Vessel b={b} max={max} animate reduced={reduced}/><span>{String(i+1).padStart(2,'0')}</span></button>)}</div>
   <div className="w3-plan-phase-labels">{vm.phases.map(p=>{const [a,b]=p.weeks.replace('W','').split('–').map(Number);return <span key={p.name} data-current={p.active} style={{flex:(b||a)-a+1}}>{p.name}</span>})}</div>
 </section>
 <section className="w3-plan-first-week">
   <div className="w3-plan-card-head"><strong>Deine erste Woche</strong><span>{vm.weekRangeLabel}</span></div>
   <div className="w3-plan-first-week-list">{sessions.map((s,i)=><button key={s.dateISO??i} onClick={()=>{setDay(i);if(s.title&&s.dateISO) onOpenSession(s.dateISO)}} className={s.title?'is-session':'is-rest'}><span className="w3-plan-first-week-day"><b>{s.weekday.slice(0,2)}</b><small>{s.dateLabel}</small></span><span className="w3-plan-first-week-name">{s.title??'Ruhetag'}</span><span className="w3-plan-first-week-meta">{s.title?`${s.dur??'—'} · ${s.tss} TSS`:'Erholung'}</span><ArrowRight size={16}/></button>)}</div>
 </section>
 <section className="w3-plan-rhythm"><div><strong>{vm.adjustHours} h</strong><span>pro Woche verfügbar</span></div><div><strong>{vm.adjustDays.filter(Boolean).length}</strong><span>Trainingstage möglich</span></div><button aria-label="Trainingswoche anpassen" onClick={()=>setSheet('adjust')}><SlidersHorizontal size={19}/></button></section>
 <button className="w3-plan-primary" onClick={onCreatedDone}>Zum ersten Training<ArrowRight size={20}/></button>
 </>:<>
 {/* DER BOGEN STEHT OBEN, und das war er vorher nicht.
     Zwischen der Kopfzeile und ihm lag der Start-jetzt-Vergleich: ein
     Radardiagramm von rund 430 px, das bei fehlenden Messungen selbst sagt,
     dass es nichts zu vergleichen gibt. Damit war das groesste Element des
     Bildschirms eine Leermeldung -- und der Bogen, der die Orientierung
     traegt, lag darunter ausserhalb des Sichtfelds.
     Der Vergleich ist interessant, aber er ist nicht die Antwort auf
     "wo stehe ich"; er steht jetzt dahinter. */}
 {/* DER BOGEN ersetzt Gefaess-Leiste, Phasenleiste, Wochenblaetterer UND
     Tagesreihe. Das waren vier Darstellungen desselben Plans, die nichts
     voneinander wussten: Man konnte ablesen, dass Woche 5 laeuft, aber nicht
     SEHEN, wo sie im Ganzen liegt und worauf sie zulaeuft. */}
 <W3PlanFocus vm={vm} selectedIndex={currentBar} currentIndex={currentIndex} day={day}
   onWeek={i=>onWeekOffset(Math.min(12,Math.max(-12,i-currentIndex)))} onDay={setDay}
   onOpen={openSession} onDevelopment={()=>setView('profile')} loading={loading}/>
 {latest?<button className="w3-plan-adaptation" onClick={()=>setSheet('adaptation')}><span><Check size={17}/></span><strong>Dein Plan hat sich angepasst.</strong><ArrowUpRight size={18}/></button>:<button className="w3-plan-link slim" onClick={()=>setSheet('why')}><span><strong>Warum diese Woche?</strong></span><ArrowUpRight size={18}/></button>}
 </>}
 </>}
 </main><W3TabBar/>
 {sheet==='archive'&&<W3PlanHistory onClose={()=>setSheet(null)} preview={previewHistory}/>}
 {sheet==='history'&&selected&&<PlanDialog title={selected.dateLabel??'Dein Training'} onClose={()=>setSheet(null)}><h3>{selected.title??'Ruhetag empfohlen'}</h3><W3PlanDayComparison day={selected}/>{selected.actualRides?.map(ride=><button className="w3-plan-recorded-ride" key={ride.id} onClick={()=>nav(`/e/w3-ride/${ride.id}`)}><span><small>Aufgezeichnete Fahrt</small>{ride.title}</span><ArrowUpRight size={18}/></button>)}{selected.rationale&&<p>{selected.rationale}</p>}<p>Die Zonen beziehen sich auf die FTP zum Zeitpunkt der Fahrt. Fehlende Leistungsdaten werden nicht ergänzt.</p>{selected.dateISO&&selected.title&&<button onClick={()=>onOpenSession(selected.dateISO!)}>Empfohlene Einheit ansehen</button>}</PlanDialog>}
 {sheet==='profile'&&<PlanDialog title="Dein Leistungsprofil" onClose={()=>setSheet(null)}><W3PowerProfile data={progressData}/></PlanDialog>}
 {sheet==='progress'&&<PlanDialog title="Dein Fortschritt" onClose={()=>setSheet(null)}><W3ProgressAnalyticsView availablePeriods={missingPlanHistory?['week','month','year']:undefined} data={progressData} period={period} onPeriod={p=>{setPeriod(p);setReferenceDate(null)}} referenceDate={referenceDate} onReferenceDate={setReferenceDate} pending={previewProgress?false:results.isPending} error={previewProgress?false:results.isError}/></PlanDialog>}
 {sheet==='adjust'&&<PlanAdjustSheet vm={vm} onClose={()=>setSheet(null)} onRebuild={onRebuild}
   /* Beide Wege waren bisher nur aus dem leeren oder beendeten Zustand
      erreichbar bzw. gar nicht. Sie leben hier, damit die Planseite
      selbst kein neues Element bekommt. */
   onRestart={()=>{setSheet(null);setSkipAutoIntro(true);setCompose('choose')}}
   onCancelPlan={onCancelPlan}/>}
 {sheet==='adaptation'&&<PlanDialog title="Was sich verändert hat" onClose={()=>setSheet(null)}><div className="w3-plan-change-list">{adaptations?.adaptations.map(a=><article key={a.id}><time>{new Date(a.created_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</time><p>{a.message_de}</p><W3AdaptationReceipt a={a}/></article>)}</div></PlanDialog>}
 {sheet==='why'&&<PlanDialog title={hasWorkout?'Warum diese Einheit?':'Deine Woche'} onClose={()=>setSheet(null)}><p>{selected?.rationale??vm.weekWhy??'Zwischen den Belastungen steht Zeit für Erholung. Deine nächste Einheit siehst du in der Wochenübersicht.'}</p><button className="w3-plan-link" onClick={()=>nav('/e/w3-goal')}>Dein Ziel ansehen<ArrowUpRight size={18}/></button></PlanDialog>}
 {compose&&<W3PlanGoalComposer focus={compose} hours={vm.adjustHours} days={vm.adjustDays} previousPlanEnd={state==='ended'?planEnd:null} onClose={()=>{setCompose(null);onComposeClose?.()}}/>}
 {userId!=null&&<W3PlanIntro userId={userId} autoShow={!skipAutoIntro} force={intro} onClose={()=>setIntro(false)}/>}
 </div>
}

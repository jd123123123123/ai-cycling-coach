import {useEffect,useId,useRef,useState,type CSSProperties,type ReactNode} from 'react'
import {useNavigate} from 'react-router-dom'
import {ArrowRight,ArrowUpRight,Check,Flag,SlidersHorizontal,Wind,X,HelpCircle,Upload,ChevronLeft,ChevronRight,Activity,Route,Clock3,Bike} from 'lucide-react'
import {motion,useReducedMotion} from 'motion/react'
import {T,FONT} from './w3tokens'
import W3TopBar from './W3TopBar'
import W3TabBar from './W3TabBar'
import {PlanAdjustSheet,type W3PlanVm,type W3PlanActions} from './W3PlanView'
import {usePlanAdaptations} from '../../hooks/usePlanAdaptations'
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
export default function W3PlanExperience({vm,state,userId,onRebuild,onOpenSession,onCreatedDone,weekOffset,onWeekOffset,planEnd,planStart,goalDate,initialCompose=false,onComposeClose,priorPlanCompleted=false,priorPlanEnd=null,loading=false,previewProgress}:{vm:W3PlanVm;state:State;userId?:number;onRebuild:W3PlanActions['onRebuild'];onOpenSession:(iso:string)=>void;onCreatedDone:()=>void;planEnd?:string|null;planStart?:string|null;initialCompose?:boolean;onComposeClose?:()=>void;priorPlanCompleted?:boolean;priorPlanEnd?:string|null;goalDate?:string|null;weekOffset:number;onWeekOffset:(offset:number)=>void;loading?:boolean;previewProgress?:ProgressExplorer}){
 const nav=useNavigate(),reduced=useReducedMotion()
 const [view,setView]=useState<'plan'|'profile'>('plan'),[goal,setGoal]=useState('ftp'),[day,setDay]=useState(0),[sheet,setSheet]=useState<'adjust'|'adaptation'|'why'|'profile'|null>(null),[intro,setIntro]=useState(false)
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
 const sessions=vm.daySessions??[]
 const identity=sessions.map(s=>s.dateISO).join(',')
 useEffect(()=>{setDay(Math.max(0,sessions.findIndex(s=>s.isToday)))},[identity])
 const selected=sessions[day]
 const title=vm.eventName==='Kein Ziel gesetzt'?'Dein Aufbauplan':vm.eventName
 const progress=Math.min(vm.totalWeeks,Math.max(1,vm.planWeekNum))
 const max=Math.max(1,...vm.weekBars.map(b=>b.tss??0))
 const currentIndex=Math.max(0,vm.planWeekNum-1)
 const currentBar=currentIndex+weekOffset
 const hasWorkout=!!selected?.title
 const openSession=()=>{if(selected?.dateISO&&hasWorkout)onOpenSession(selected.dateISO);else setSheet('why')}
 const styles={'--plan-acid':T.acid,'--plan-ink':T.ink,'--plan-bg':T.bg,'--plan-card':T.surface,'--plan-raised':T.surface2,'--plan-muted':T.mid,'--plan-stroke':T.stroke,fontFamily:FONT} as CSSProperties
 return <div className={`w3-plan-experience state-${state}`} style={styles}>
 <W3TopBar title="Plan" extra={<button className="w3-plan-help" aria-label="So funktioniert dein Plan" onClick={()=>setIntro(true)}><HelpCircle size={18}/></button>}/>
 <main className="w3-plan-content">
 {state!=='empty'&&<div className="w3-plan-view-switch"><button aria-pressed={view==='plan'} onClick={()=>setView('plan')}>{state==='ended'?'Ergebnis':'Plan'}</button><button aria-pressed={view==='profile'} onClick={()=>setView('profile')}>Entwicklung</button><button className="w3-plan-settings" aria-label="Zeit und Trainingstage anpassen" onClick={()=>setSheet('adjust')}><SlidersHorizontal size={19}/></button></div>}
 {state==='empty'?<>
 <h1>Was hast<br/>du vor?</h1>
 <p className="w3-plan-empty-note">Noch kein abgeschlossener Plan. Lege jetzt deinen Fokus fest — dann zeigt dir RIDR, warum jede Einheit dort steht.</p>
 <section className="w3-plan-goal-art"><div><span>{goal==='ftp'?'FTP aufbauen':goal==='vo2'?'VO₂max aufbauen':'Ausdauer aufbauen'}</span><h2>{goal==='ftp'?<>Länger<br/>schnell fahren.</>:goal==='vo2'?<>Mehr Luft.<br/>Mehr Möglichkeiten.</>:<>Weiter als<br/>letztes Mal.</>}</h2></div><GoalArt goal={goal}/></section>
 <div className="w3-plan-goals">{[['ftp','FTP'],['hours','Ausdauer'],['vo2','VO₂max']].map(([key,label])=><button key={key} aria-pressed={goal===key} onClick={()=>setGoal(key)}>{label}{goal===key&&<Check size={15}/>}</button>)}</div>
 <button className="w3-plan-link" onClick={()=>setCompose('choose')}><Flag size={22}/><span><strong>Mehrere Schwerpunkte kombinieren</strong><span>Oder für ein Event trainieren</span></span><ArrowUpRight size={20}/></button>
 <button className="w3-plan-link" onClick={()=>nav('/plan/import')}><Upload size={22}/><span><strong>Du hast schon einen Plan?</strong><span>Trainingsplan importieren</span></span><ArrowUpRight size={20}/></button>
 <button className="w3-plan-primary" onClick={()=>setCompose(goal==='ftp'?'threshold':goal==='vo2'?'vo2':'endurance')}>Meinen Plan erstellen<ArrowRight size={20}/></button>
 </>:view==='profile'||state==='ended'?<>
 <div className="w3-plan-opening"><h1>{missingPlanHistory?<>Dein nächster<br/>Schritt.</>:state==='ended'?<>Das hast du<br/>bewegt.</>:<>Deine<br/>Entwicklung.</>}</h1><p>{missingPlanHistory?'Dein bisheriger Plan ist beendet. Wähle, was du als Nächstes verbessern möchtest.':title}</p></div>
 {missingPlanHistory&&<button className="w3-plan-primary" onClick={()=>setCompose('choose')}>Nächstes Ziel wählen<ArrowRight size={20}/></button>}
 {state==='ended'&&!missingPlanHistory&&<section className="w3-plan-finish-hero" aria-labelledby="w3-plan-finish-title">
   <div className="w3-plan-finish-eyebrow">PLAN ABGESCHLOSSEN · DEIN ERGEBNIS</div>
   <h2 id="w3-plan-finish-title">Du hast den<br/><em>Block geliefert.</em></h2>
   <p className="w3-plan-finish-copy">{vm.totalWeeks} Wochen konsequent gefahren. Hier ist, was davon geblieben ist.</p>
   <div className="w3-plan-finish-stats">
     <div><strong>{ftpDelta!=null?`${ftpDelta>=0?'+':''}${Math.round(ftpDelta)} W`:'—'}</strong><span>FTP SEIT START</span></div>
     <div><strong>{vo2Delta!=null?`${vo2Delta>=0?'+':''}${Math.round(vo2Delta)}`:'—'}</strong><span>VO₂MAX-PUNKTE</span></div>
     <div><strong>{vm.avgTss}</strong><span>Ø TSS / WOCHE</span></div>
   </div>
   {vm.finishStats&&<div className="w3-plan-finish-totals" aria-label="Gesamtleistung im Plan">
     <div className="w3-plan-finish-totals-head"><span>DEIN BLOCK IN ZAHLEN</span><small>{vm.totalWeeks} Wochen · {vm.finishStats.rides} Fahrten</small></div>
     <div className="w3-plan-finish-total-grid">
     <div><Activity size={14}/><strong>{vm.finishStats.tss}</strong><span>GESAMT TSS</span></div>
     <div><Route size={14}/><strong>{vm.finishStats.km}</strong><span>KILOMETER</span></div>
     <div><Clock3 size={14}/><strong>{vm.finishStats.hours}</strong><span>STUNDEN</span></div>
     <div><Bike size={14}/><strong>{vm.finishStats.rides}</strong><span>FAHRTEN</span></div>
     </div>
   </div>}
   <div className="w3-plan-finish-volume" aria-label="Trainingsrhythmus über den Plan">
     <div className="w3-plan-finish-volume-head"><span>DEIN RHYTHMUS</span><small>Belastung pro Woche</small></div>
     <div className="w3-plan-finish-volume-bars">{vm.weekBars.map((b,i)=><span key={i} title={`Woche ${i+1}: ${b.tss??'Ruhe'}`}><i style={{height:`${b.tss==null?7:Math.max(10,b.tss/max*100)}%`}} data-rest={b.isRest}/><b>{i+1}</b></span>)}</div>
     <div className="w3-plan-finish-volume-axis"><span>Planstart</span><span>Abschluss</span></div>
   </div>
   <div className="w3-plan-finish-profile"><W3PowerProfile data={progressData}/></div>
   <div className="w3-plan-finish-wins"><span>DEINE GEWINNE</span><strong>{ftpDelta!=null&&ftpDelta>0?'Schwelle angehoben':'Deine Basis gefestigt'} · {vo2Delta!=null&&vo2Delta>0?'mehr Reserve':'mehr Konstanz'}</strong></div>
 </section>}
 <button className="w3-plan-link slim" onClick={()=>setSheet('profile')}><span><strong>Leistungsprofil vergleichen</strong></span><ArrowUpRight size={18}/></button>
 <W3ProgressAnalyticsView availablePeriods={missingPlanHistory?['week','month','year']:undefined} data={progressData} period={period} onPeriod={p=>{setPeriod(p);setReferenceDate(null)}} referenceDate={referenceDate} onReferenceDate={setReferenceDate} pending={previewProgress?false:results.isPending} error={previewProgress?false:results.isError}/>
 {state==='ended'&&!missingPlanHistory&&<button className="w3-plan-primary" onClick={()=>setCompose('choose')}>Was baust du als Nächstes?<ArrowRight size={20}/></button>}
 </>:<>
 <header className="w3-plan-heading"><div><h1>{state==='created'?<>Dein Plan<br/>steht.</>:title}</h1><p>{state==='created'?'Gespeichert · dein Weg ist klar':`${vm.block?.phase??'Training'} · ${vm.planWeekLabel}${goalDate?' · Ziel '+new Date(goalDate+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'short'}):''}`}</p></div><div className="w3-plan-week-count">{String(progress).padStart(2,'0')}<span>/{String(vm.totalWeeks).padStart(2,'0')}</span></div></header>
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
     <div className="w3-plan-week-beams">{vm.weekBars.map((b,i)=><span key={i} className="w3-plan-week-track"><i style={{height:`${b.tss==null?4:Math.max(6,b.tss/max*100)}%`}} data-rest={b.isRest}/></span>)}</div>
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
   <div className="w3-plan-week-beams">{vm.weekBars.map((b,i)=><button key={i} aria-label={`Woche ${i+1}: ${b.tss??'keine'} TSS${b.kind==='done'?', gefahren':', geplant'}`} aria-pressed={currentBar===i} data-selected={currentBar===i} disabled={i<currentIndex||i-currentIndex>12} onClick={()=>onWeekOffset(i-currentIndex)}><span className="w3-plan-week-track"><motion.i initial={false} animate={{height:`${b.tss==null?4:Math.max(6,b.tss/max*100)}%`}} transition={{duration:reduced?0:.35}} data-rest={b.isRest} data-past={i<currentIndex}/></span><span>{String(i+1).padStart(2,'0')}</span></button>)}</div>
   <div className="w3-plan-phase-labels">{vm.phases.map(p=>{const [a,b]=p.weeks.replace('W','').split('–').map(Number);return <span key={p.name} data-current={p.active} style={{flex:(b||a)-a+1}}>{p.name}</span>})}</div>
 </section>
 <section className="w3-plan-first-week">
   <div className="w3-plan-card-head"><strong>Deine erste Woche</strong><span>{vm.weekRangeLabel}</span></div>
   <div className="w3-plan-first-week-list">{sessions.map((s,i)=><button key={s.dateISO??i} onClick={()=>{setDay(i);if(s.title&&s.dateISO) onOpenSession(s.dateISO)}} className={s.title?'is-session':'is-rest'}><span className="w3-plan-first-week-day"><b>{s.weekday.slice(0,2)}</b><small>{s.dateLabel}</small></span><span className="w3-plan-first-week-name">{s.title??'Ruhetag'}</span><span className="w3-plan-first-week-meta">{s.title?`${s.dur??'—'} · ${s.tss} TSS`:'Erholung'}</span><ArrowRight size={16}/></button>)}</div>
 </section>
 <section className="w3-plan-rhythm"><div><strong>{vm.adjustHours} h</strong><span>pro Woche verfügbar</span></div><div><strong>{vm.adjustDays.filter(Boolean).length}</strong><span>Trainingstage möglich</span></div><button aria-label="Trainingswoche anpassen" onClick={()=>setSheet('adjust')}><SlidersHorizontal size={19}/></button></section>
 <button className="w3-plan-primary" onClick={onCreatedDone}>Zum ersten Training<ArrowRight size={20}/></button>
 </>:<>
 <section className="w3-plan-development" aria-labelledby="w3-plan-development-active-title">
   <div className="w3-plan-card-head"><h2 id="w3-plan-development-active-title">Start → jetzt</h2><span>Was sich bewegt</span></div>
   <p className="w3-plan-development-note">Dein Leistungsprofil im Vergleich zum Planstart.</p>
   <W3PowerProfile data={progressData}/>
 </section>
 <section className="w3-plan-journey"><div className="w3-plan-card-head"><strong>Dein aktueller Block</strong><span>{vm.totalWeeks} Wochen · TSS</span></div>
 <div className="w3-plan-week-beams">{vm.weekBars.map((b,i)=><button key={i} aria-label={`Woche ${i+1}: ${b.tss??'keine'} TSS${b.kind==='done'?', gefahren':', geplant'}`} aria-pressed={currentBar===i} data-selected={currentBar===i} disabled={i<currentIndex||i-currentIndex>12} onClick={()=>onWeekOffset(i-currentIndex)}><span className="w3-plan-week-track"><motion.i initial={false} animate={{height:`${b.tss==null?4:Math.max(6,b.tss/max*100)}%`}} transition={{duration:reduced?0:.35}} data-rest={b.isRest} data-past={i<currentIndex}/></span><span>{String(i+1).padStart(2,'0')}</span></button>)}</div>
 <div className="w3-plan-phase-labels">{vm.phases.map(p=>{const [a,b]=p.weeks.replace('W','').split('–').map(Number);return <span key={p.name} data-current={p.active} style={{flex:(b||a)-a+1}}>{p.name}</span>})}</div>
 <div className="w3-plan-selected-week"><button aria-label="Vorherige Woche" disabled={weekOffset===0} onClick={()=>onWeekOffset(weekOffset-1)}><ChevronLeft size={17}/></button><span>{vm.weekRangeLabel}</span><button aria-label="Nächste Woche" disabled={weekOffset>=Math.min(12,vm.totalWeeks-progress)} onClick={()=>onWeekOffset(weekOffset+1)}><ChevronRight size={17}/></button></div>
 </section>
 {state==='active'&&<section className="w3-plan-session" aria-busy={loading}>
 <div className="w3-plan-card-head"><span>{selected?.isToday?'Heute':selected?.weekday} · {selected?.dateLabel??vm.weekRangeLabel}</span><span>{selected?.dur??'Frei'}</span></div>
 <h2>{selected?.title??'Raum für Erholung.'}</h2>
 <div className="w3-plan-workout" role="img" aria-label={hasWorkout?`${selected?.title}, ${selected?.targetW}, ${selected?.tss} TSS`:'Ruhetag'}>{hasWorkout?<><span className="w3-plan-ftp-line">100 % FTP</span><div className="w3-plan-intervals">{selected!.bars.map((b,i)=><i key={i} data-work={b.work} style={{height:`${Math.min(100,Math.max(8,b.w*100))}%`}}/>)}</div></>:<Wind size={72} strokeWidth={1}/>}</div>
 {hasWorkout&&<div className="w3-plan-measures"><span><strong>{selected?.targetW}</strong> Ø Ziel</span><span><strong>{selected?.tss}</strong> TSS</span><span><strong>{selected?.ftpPct}</strong> FTP</span></div>}
 <div className="w3-plan-days" aria-label="Trainingstag">{sessions.map((s,i)=><button key={s.dateISO??i} aria-label={`${s.weekday} ${s.dateLabel}: ${s.title??'Ruhetag'}`} aria-pressed={day===i} onClick={()=>setDay(i)}><span>{s.weekday.slice(0,2)}</span><i data-work={!!s.title} data-ridden={s.ridden}/></button>)}</div>
 <button className="w3-plan-primary" disabled={loading||!selected} onClick={openSession}>{hasWorkout?'Einheit ansehen':'Warum heute Pause?'}<ArrowRight size={19}/></button>
 </section>}
 {latest?<button className="w3-plan-adaptation" onClick={()=>setSheet('adaptation')}><span><Check size={17}/></span><strong>Dein Plan hat sich angepasst.</strong><ArrowUpRight size={18}/></button>:<button className="w3-plan-link slim" onClick={()=>setSheet('why')}><span><strong>Warum diese Woche?</strong></span><ArrowUpRight size={18}/></button>}
 </>}
 </>}
 </main><W3TabBar/>
 {sheet==='profile'&&<PlanDialog title="Dein Leistungsprofil" onClose={()=>setSheet(null)}><W3PowerProfile data={progressData}/></PlanDialog>}
 {sheet==='adjust'&&<PlanAdjustSheet vm={vm} onClose={()=>setSheet(null)} onRebuild={onRebuild}/>}
 {sheet==='adaptation'&&<PlanDialog title="Was sich verändert hat" onClose={()=>setSheet(null)}><div className="w3-plan-change-list">{adaptations?.adaptations.map(a=><article key={a.id}><time>{new Date(a.created_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</time><p>{a.message_de}</p></article>)}</div></PlanDialog>}
 {sheet==='why'&&<PlanDialog title={hasWorkout?'Warum diese Einheit?':'Deine Woche'} onClose={()=>setSheet(null)}><p>{selected?.rationale??vm.weekWhy??'Zwischen den Belastungen steht Zeit für Erholung. Deine nächste Einheit siehst du in der Wochenübersicht.'}</p><button className="w3-plan-link" onClick={()=>nav('/e/w3-goal')}>Dein Ziel ansehen<ArrowUpRight size={18}/></button></PlanDialog>}
 {compose&&<W3PlanGoalComposer focus={compose} hours={vm.adjustHours} days={vm.adjustDays} previousPlanEnd={state==='ended'?planEnd:null} onClose={()=>{setCompose(null);onComposeClose?.()}}/>}
 {userId!=null&&<W3PlanIntro userId={userId} autoShow={!skipAutoIntro} force={intro} onClose={()=>setIntro(false)}/>}
 </div>
}

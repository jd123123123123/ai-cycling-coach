import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { W3PlanVm, PlanDaySession } from './W3PlanView'
import './w3PlanFocus.css'
import type { IntervalBlockOut } from '../../api/weeks'
import { weekCurve } from './w3PlanCurve'

/** Plan, week and session use the saved prescription. Selection is not completion. */
export default function W3PlanFocus({vm,selectedIndex,currentIndex,day,onWeek,onDay,onOpen,onDevelopment,loading}:{vm:W3PlanVm;selectedIndex:number;currentIndex:number;day:number;onWeek:(i:number)=>void;onDay:(i:number)=>void;onOpen:()=>void;onDevelopment:()=>void;loading:boolean}) {
 const days=vm.daySessions??[], selected=days[day]
 const max=Math.max(1,...vm.weekBars.map(w=>Math.max(w.planned,w.actual??0)))
 const maxDay=Math.max(1,...days.map(d=>Number(d.tss)||0))
 const blocks=vm.phases.map(p=>{const n=p.weeks.match(/\d+/g)?.map(Number)??[];return {...p,start:(n[0]??1)-1,end:(n[1]??n[0]??1)-1}}).filter(p=>p.start<vm.weekBars.length)
 const phase=blocks.find(p=>selectedIndex>=p.start&&selectedIndex<=p.end)
 const bars=mergeBars(selected)
 const weekRail=useRef<HTMLDivElement>(null), gradientId=useId()
 useEffect(()=>{
  const rail=weekRail.current,button=rail?.querySelector<HTMLElement>('[aria-pressed="true"]')
  if(!rail||!button)return
  rail.scrollTo({left:Math.max(0,button.offsetLeft-rail.offsetLeft-rail.clientWidth/2+button.clientWidth/2),behavior:'instant'})
 },[selectedIndex])
 const start=days[0]?.dateISO,end=days.at(-1)?.dateISO
 const fmt=(iso:string)=>new Date(iso+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'short'})
 const dateRange=start&&end?`${fmt(start)} – ${fmt(end)}`:vm.weekRangeLabel.split(' · ')[0]
 const rangeMax=Math.max(1,...bars.map(b=>b.w))
 const n=Math.max(1,vm.weekBars.length)
 const x=(i:number)=>(i+.5)/n*320
 const y=(value:number)=>102-value/max*82
 const plannedCurve=weekCurve(vm.weekBars.map(w=>w.planned),x,y)
 const actualCurve=weekCurve(vm.weekBars.map(w=>w.actual),x,y)
 const selectedWeek=vm.weekBars[selectedIndex]
 const title=phase?.name??vm.block?.phase??'Dein Plan'
 return <section className="w3-focus-plan" aria-label="Dein Trainingsplan" aria-busy={loading}>
   <section className="focus-plan-timeline" aria-label="Planverlauf">
     <header className="focus-phase-title">
       <div><h2>{title}</h2><span>{dateRange}</span></div>
       <div className="focus-week-number"><span>Woche</span><strong>{String(selectedIndex+1).padStart(2,'0')}<small>/{String(vm.totalWeeks).padStart(2,'0')}</small></strong></div>
     </header>
     <div className="focus-plan-rail" ref={weekRail}>
       <div className="focus-plan-rail-content" style={{'--week-count':n} as CSSProperties}>
         <div className="focus-plan-landscape">
           <svg viewBox="0 0 320 112" preserveAspectRatio="none" role="img" aria-label={`Wochenbelastung. Woche ${selectedIndex+1}: ${selectedWeek?.planned??'—'} TSS geplant${selectedWeek?.actual!=null?`, ${selectedWeek.actual} TSS gefahren`:''}.`} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();const i=Math.min(n-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*n)));if(Math.abs(i-currentIndex)<=12)onWeek(i)}}>
             <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--plan-ink)" stopOpacity=".12"/><stop offset="1" stopColor="var(--plan-ink)" stopOpacity="0"/></linearGradient></defs>
             <path className="focus-plan-grid" d="M0 102H320"/>
             {plannedCurve&&<path d={`${plannedCurve} L${x(n-1)} 102 L${x(0)} 102 Z`} fill={`url(#${gradientId})`}/>}
             <path className="focus-plan-line" d={plannedCurve}/>
             <path className="focus-plan-actual" d={actualCurve}/>
             {selectedWeek&&<g className="focus-plan-cursor"><path d={`M${x(selectedIndex)} ${y(selectedWeek.planned)+7} V102`}/></g>}
           </svg>
           {vm.weekBars.map((w,i)=>w.actual==null?null:<i key={w.idx} aria-hidden className="focus-plan-ridden" style={{left:`${x(i)/320*100}%`,top:`${y(w.actual)/112*100}%`}}/>)}
           {selectedWeek&&<i aria-hidden className="focus-plan-marker" style={{left:`${x(selectedIndex)/320*100}%`,top:`${y(selectedWeek.planned)/112*100}%`}}/>}
         </div>
         <div className="focus-plan-weeks" role="group" aria-label="Trainingswoche wählen">{vm.weekBars.map((w,i)=><button key={w.idx} aria-label={`Woche ${w.idx}: ${w.planned} TSS geplant${w.actual!=null?`, ${w.actual} TSS gefahren`:''}${i===currentIndex?', aktuelle Woche':''}`} aria-current={i===currentIndex?'step':undefined} aria-pressed={i===selectedIndex} disabled={Math.abs(i-currentIndex)>12} onClick={()=>onWeek(i)}><span>{String(w.idx).padStart(2,'0')}</span></button>)}</div>
         <div className="focus-plan-phases" aria-label="Planphasen">{blocks.map(p=><button key={p.name} style={{gridColumn:`${p.start+1} / ${Math.min(vm.weekBars.length,p.end+1)+1}`}} aria-pressed={phase===p} disabled={p.start-currentIndex < -12 || p.start-currentIndex > 12} onClick={()=>onWeek(Math.min(vm.weekBars.length-1,p.start))}>{p.name}</button>)}</div>
       </div>
     </div>
     <div className="focus-plan-key"><span><i/>Plan <i data-actual/>Gefahren</span><button onClick={onDevelopment}>Entwicklung<ArrowUpRight size={14}/></button></div>
   </section>
   <section className="focus-plan-detail" aria-label="Ausgewählte Woche">

     <div className="focus-plan-days" role="group" aria-label="Trainingstag wählen">{days.map((d,i)=><button key={d.dateISO??i} aria-pressed={i===day} aria-current={d.isToday?'date':undefined} aria-label={`${d.weekday}, ${d.dateLabel}, ${d.title??'Ruhetag'}${Number.isFinite(Number(d.tss))?`, ${d.tss} TSS`:''}`} onClick={()=>onDay(i)}><span>{d.weekday.slice(0,2)}</span><b>{d.dateISO?Number(d.dateISO.slice(8,10)):d.dateLabel.match(/\d+/)?.[0]??'—'}</b><i aria-hidden><em style={{height:`${(Number(d.tss)||0)/maxDay*100}%`}}/></i></button>)}</div>
     <article className="focus-session" data-rest={!selected?.title||undefined}>
       <div className="focus-session-heading"><div><span>{selected?.isToday?'Heute':selected?.dateLabel??'Einheit'}{selected?.isPast?' · Empfehlung':''}</span><h2>{selected ? selected.title??'Zeit für Erholung.' : loading?'Deine Woche lädt.':'Noch keine Einheit.'}</h2></div><button className="focus-session-open" disabled={loading||!selected} onClick={onOpen} aria-label={selected?.isPast?'Empfehlung & Rückblick':selected?.title?'Einheit ansehen':'Warum heute Pause?'}><span className="focus-session-action"><ArrowUpRight size={19}/></span></button></div>
       {selected?.title?<>
         <div className="focus-session-chart">
           {bars.length?<div className="focus-session-graph" role="img" aria-label={`Geplantes Belastungsprofil, ${selected.ftpPct} FTP im Mittel. Gestrichelte Linie: 100 Prozent FTP.`}>
             <span className="focus-session-ftp" style={{bottom:`${(2/3)/rangeMax*100}%`}}><span>FTP</span></span>
             {bars.map((b,i)=><i key={i} data-work={b.work} style={{height:`${Math.max(2,b.w/rangeMax*100)}%`,flex:b.size}}/>)}
           </div>:<div className="focus-session-no-power">Freie Fahrt · ohne Leistungsvorgabe</div>}
         </div>
         <div className="focus-session-facts">
           <div><strong>{selected.dur??'—'}</strong><span>Dauer</span></div>
           <div><strong>{selected.targetW??'—'}</strong><span>{selected.ftpPct?`${selected.ftpPct} FTP`:'Zielleistung'}</span></div>
           <div><strong>{selected.tss}</strong><span>TSS</span></div>
         </div>
       </>:<div className="focus-session-rest"><span/>{selected?'Raum für Erholung.':loading?'Training wird geladen.':'Wähle eine andere Woche.'}<span/></div>}
     </article>
   </section>
 </section>
}
export function mergeBars(day?:PlanDaySession){
 const source=day?.bars??[]
 // Width is elapsed time when the prescription provides it. Older preview
 // samples retain their equal widths without inventing durations.
 return source.reduce<{w:number;work:boolean;size:number}[]>((out,b)=>{const last=out.at(-1),size=b.seconds??1;if(last&&last.w===b.w&&last.work===b.work)last.size+=size;else out.push({...b,size});return out},[])
}
export function sessionBars(intervals:IntervalBlockOut[],intensity:number|null,seconds:number){
 const bars:{w:number;work:boolean;seconds:number}[]=[]
 const add=(s:number,p:number)=>{if(s>0)bars.push({seconds:s,w:Math.max(.07,p/1.5),work:p>=.6})}
 for(const b of intervals){
  const p=b.power_target_pct_ftp
  if(p==null)continue
  if(b.reps&&b.on_s&&b.off_s&&b.off_pct_ftp!=null){
   for(let i=0;i<Math.min(300,b.reps);i++){add(b.on_s,p);add(b.off_s,b.off_pct_ftp)}
  }else add(b.duration_seconds,p)
 }
 if(!bars.length&&intensity!=null&&seconds>0)add(seconds,intensity)
 return bars
}

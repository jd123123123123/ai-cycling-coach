import { ArrowRight, ArrowUpRight, Moon } from 'lucide-react'
import type { W3PlanVm, PlanDaySession } from './W3PlanView'
import './w3PlanFocus.css'
import type { IntervalBlockOut } from '../../api/weeks'

/** Only the presentation changes: all dates, loads and targets come from the saved plan. */
export default function W3PlanFocus({vm,selectedIndex,currentIndex,day,onWeek,onDay,onOpen,onProfile,loading}:{vm:W3PlanVm;selectedIndex:number;currentIndex:number;day:number;onWeek:(i:number)=>void;onDay:(i:number)=>void;onOpen:()=>void;onProfile:()=>void;loading:boolean}) {
 const days=vm.daySessions??[], selected=days[day]
 const max=Math.max(1,...vm.weekBars.map(w=>w.planned))
 const blocks=vm.phases.map(p=>{const n=p.weeks.match(/\d+/g)?.map(Number)??[];return {...p,start:(n[0]??1)-1,end:(n[1]??n[0]??1)-1}})
 const phase=blocks.find(p=>selectedIndex>=p.start&&selectedIndex<=p.end)
 const bars=mergeBars(selected)
 return <section className="w3-focus-plan" aria-label="Dein Trainingsplan" aria-busy={loading}>
   <header className="focus-phase-title"><span>{phase?.name??vm.block?.phase??'Dein Plan'}</span><span>Woche <b>{selectedIndex+1}</b> / {vm.totalWeeks}</span></header>
   <div className="focus-plan-weeks" role="group" aria-label="Trainingswoche wählen">{vm.weekBars.map((w,i)=><button key={w.idx} aria-label={`Woche ${w.idx}: ${w.planned} TSS geplant${w.actual!=null?`, ${w.actual} TSS gefahren`:''}${i===currentIndex?', aktuelle Woche':''}`} aria-pressed={i===selectedIndex} disabled={i-currentIndex < -12 || i-currentIndex>12} onClick={()=>onWeek(i)}><span className="focus-week-track"><i style={{height:`${Math.max(8,w.planned/max*100)}%`}}><em style={{height:`${Math.max(0,Math.min(1,w.fill??0))*100}%`}}/></i></span><span>{w.idx}</span>{i===currentIndex&&<small aria-hidden/>}</button>)}</div>
   <div className="focus-plan-phases" aria-label="Planphasen">{blocks.map(p=><button key={p.name} style={{flex:Math.max(1,Math.min(vm.weekBars.length-1,p.end)-p.start+1)}} aria-pressed={phase===p} disabled={p.start-currentIndex < -12 || p.start-currentIndex > 12} onClick={()=>onWeek(Math.min(vm.weekBars.length-1,p.start))}>{p.name}</button>)}</div>
   <div className="focus-plan-week-caption"><span>{vm.weekRangeLabel}</span><button onClick={onProfile}>Entwicklung<ArrowUpRight size={14}/></button></div>
   <div className="focus-plan-days" role="group" aria-label="Trainingstag wählen">{days.map((d,i)=><button key={d.dateISO??i} aria-pressed={i===day} aria-label={`${d.weekday}, ${d.dateLabel}, ${d.title??'Ruhetag'}, ${d.tss} TSS`} onClick={()=>onDay(i)}><span>{d.weekday.slice(0,2)}</span><b>{d.dateISO?Number(d.dateISO.slice(8,10)):d.dateLabel.match(/\d+/)?.[0]??'—'}</b><i><em style={{height:`${Math.min(100,Math.max(3,(Number(d.tss)||0)/200*100))}%`}}/></i></button>)}</div>
   <article className="focus-session" data-rest={!selected?.title||undefined}>
     <div className="focus-session-heading"><div><span>{selected?.isToday?'Heute':selected?.dateLabel??'Einheit'}{selected?.isPast?' · geplant':''}</span><h2>{selected?.title??'Zeit für Erholung.'}</h2></div>{selected?.title?<span className="focus-session-duration">{selected.dur}</span>:<Moon size={27} strokeWidth={1.25}/>}</div>
     <div className="focus-session-graph" role="img" aria-label={selected?.title?`Geplantes Belastungsprofil, ${selected.ftpPct} FTP im Mittel`:'Ruhetag ohne Training'}>{bars.map((b,i)=><i key={i} data-work={b.work} style={{height:`${Math.min(100,Math.max(7,b.w*100))}%`,flex:b.size}}/>)}</div>
     <div className="focus-session-facts"><span>{selected?.title?selected.targetW:'Anpassung braucht Pause.'}</span>{selected?.title&&<span>{selected.ftpPct} FTP <span aria-hidden> / </span> {selected.tss} TSS</span>}</div>
     <button className="w3-plan-primary" disabled={loading||!selected} onClick={onOpen}>{selected?.isPast?'Empfehlung & Rückblick':selected?.title?'Einheit ansehen':'Warum heute Pause?'}<ArrowRight size={19}/></button>
   </article>
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

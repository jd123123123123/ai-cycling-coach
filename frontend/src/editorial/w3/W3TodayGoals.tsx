import { useState, type CSSProperties } from 'react'
import { ArrowUpRight, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRewardChallenges, useChallengeDays } from '../../hooks/useRewardChallenges'
import { useCrewChallenges } from '../../hooks/useChallenges'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import type { ChallengeMetric, RewardChallenge } from '../../api/rewardChallenges'
import type { CrewChallenge } from '../../api/challenges'
import { T, FONT } from './w3tokens'
import './w3TodayGoals.css'

const UNITS:Record<ChallengeMetric,string>={active_days:'Tage',distance_km:'km',tss:'TSS',rides:'Fahrten',hours:'h',kj:'kJ'}
const number=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
export interface TodayGoal {id:string;title:string;value:number|null;target:number;unit:string;scope:'Du'|'Crew';period:string;personalKey?:string;periodKey?:string;reward?:number;members?:{id:number;handle:string;value:number}[]}
export function todayGoals(personal:RewardChallenge[],crew:CrewChallenge[],userId?:number,period?:string):TodayGoal[] {
 return [
  ...personal.map(c=>({id:`personal:${c.key}`,personalKey:c.key,periodKey:period,title:c.title,value:c.value,target:c.target,unit:UNITS[c.metric],scope:'Du' as const,period:period?new Date(`${period}-01T00:00:00Z`).toLocaleDateString('de-DE',{month:'long',year:'numeric',timeZone:'UTC'}):'Monatsziel',reward:c.completed?(c.awarded_rc??c.reward_rc):c.reward_rc})),
  ...crew.map(c=>({id:`crew:${c.id}`,title:c.name,value:c.participants.find(p=>p.user_id===userId)?.value??null,target:c.target,unit:UNITS[c.metric],scope:'Crew' as const,period:c.starts_on&&c.ends_on?`${new Date(c.starts_on+'T00:00:00Z').toLocaleDateString('de-DE',{day:'numeric',month:'short',timeZone:'UTC'})}–${new Date(c.ends_on+'T00:00:00Z').toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}`:c.period==='week'?'Wochenziel':c.period==='month'?'Monatsziel':'Crew',members:c.participants.map(p=>({id:p.user_id,handle:p.handle,value:p.value}))})),
 ]
}
function useGoals(){
 const personal=useRewardChallenges(),crew=useCrewChallenges(),profile=useAthleteProfile()
 return {items:todayGoals(personal.data?.active??[],crew.data??[],profile.data?.user_id,personal.data?.period),pending:personal.isPending||crew.isPending,error:personal.isError||crew.isError}
}
const goalVars=()=>({'--goal-ink':T.ink,'--goal-mid':T.mid,'--goal-acid':T.acid,'--goal-rule':T.rule,'--goal-surface':T.surface2,'--goal-acid-dim':T.acidDim,'--goal-button-ink':T.heroInk,fontFamily:FONT} as CSSProperties)
const percent=(goal:TodayGoal)=>goal.value!=null&&Number.isFinite(goal.value)&&goal.target>0?Math.max(0,Math.min(100,goal.value/goal.target*100)):null
function GoalRing({goal,small=false}:{goal:TodayGoal;small?:boolean}){
 const pct=percent(goal)
 return <svg viewBox="0 0 100 100" className={small?'w3-goal-ring-small':'w3-goal-ring'} role="img" aria-label={`${goal.title}: ${goal.value==null?'Noch kein eigener Stand':`${number(goal.value)} von ${number(goal.target)} ${goal.unit}`}`}>
  <circle cx="50" cy="50" r="42" fill="none" stroke={T.rule} strokeWidth="7"/>
  {pct!=null&&pct>0&&<circle cx="50" cy="50" r="42" fill="none" stroke={T.acid} strokeWidth="7" pathLength="100" strokeDasharray={`${pct} 100`} strokeLinecap="round" transform="rotate(-90 50 50)"/>}
  <text x="50" y="56" textAnchor="middle" fill={T.ink} fontFamily="Archivo,sans-serif" fontSize="25" fontWeight="650">{pct==null?'':Math.round(pct)}{pct!=null&&<tspan fontSize="12">%</tspan>}</text>
 </svg>
}
export function W3TodayGoalsSummaryView({items,pending=false,error=false}:{items:TodayGoal[];pending?:boolean;error?:boolean}) {
 const mine=items.find(g=>g.scope==='Du'&&(percent(g)??0)<100)??items.find(g=>g.scope==='Du')
 const shared=items.find(g=>g.scope==='Crew')
 const shown=[mine,shared].filter((g):g is TodayGoal=>!!g)
 if(!shown.length)return <span style={{fontSize:12,color:T.mid}}>{pending?'Ziele werden geladen…':error?'Ziele gerade nicht verfügbar':'Dein nächstes Ziel setzen'}</span>
 return <div className="w3-goals-summary" style={goalVars()}>{shown.map(goal=><div className="w3-goal-mini" key={goal.id}>
  <div className="w3-goal-mini-top"><GoalRing goal={goal} small/><span>{goal.scope==='Crew'?'Crew · du':'Dein Ziel'}</span></div>
  <div className="w3-goal-mini-title">{goal.title}</div>
  <strong>{goal.value==null?'—':number(goal.value)} <small>{goal.unit}</small></strong>
  <span className="w3-goal-target">von {number(goal.target)} {goal.unit}</span>
 </div>)}</div>
}
export function W3TodayGoalsSummary(){const goals=useGoals();return <W3TodayGoalsSummaryView {...goals}/>}
export interface GoalDaySeries {key:string;period:string;days:number[]}
function GoalDays({series,unit}:{series:GoalDaySeries;unit:string}){
 const [selected,setSelected]=useState<number|null>(null)
 const max=Math.max(1,...series.days.filter(Number.isFinite))
 const current=selected??Math.max(0,series.days.findLastIndex(v=>v>0))
 const value=series.days[current]
 const width=300/Math.max(1,series.days.length)
 const label=new Date(`${series.period}-${String(current+1).padStart(2,'0')}T00:00:00Z`).toLocaleDateString('de-DE',{day:'numeric',month:'short',timeZone:'UTC'})
 return <div className="w3-goal-days"><div className="w3-goal-days-reading"><span>Deine Beiträge</span><strong>{label} · {Number.isFinite(value)?number(value):'—'} {unit}</strong></div>
  <svg viewBox="0 0 320 90" role="img" aria-label="Tägliche Beiträge zum Monatsziel" onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();setSelected(Math.max(0,Math.min(series.days.length-1,Math.floor(((e.clientX-rect.left)/rect.width*320-10)/width))))}} onPointerDown={e=>{const rect=e.currentTarget.getBoundingClientRect();setSelected(Math.max(0,Math.min(series.days.length-1,Math.floor(((e.clientX-rect.left)/rect.width*320-10)/width))))}}>
   {series.days.map((v,i)=>Number.isFinite(v)&&v>0?<rect key={i} x={10+i*width+1} y={75-v/max*65} width={Math.max(1,width-3)} height={v/max*65} rx="2" fill={i===current?T.acid:T.d3}/>:null)}
   <line x1="10" x2="310" y1="77" y2="77" stroke={T.rule}/><text x="10" y="89" fontSize="9" fill={T.mid}>1.</text><text x="310" y="89" textAnchor="end" fontSize="9" fill={T.mid}>{series.days.length}.</text>
  </svg>
  <input type="range" min="0" max={series.days.length-1} value={current} aria-label="Tag des Zielbeitrags auswählen" aria-valuetext={`${label}: ${number(value??0)} ${unit}`} onChange={e=>setSelected(Number(e.target.value))}/>
 </div>
}
export function W3TodayGoalsView({items,selectedId,onSelect,series,seriesPending=false,onManage,pending=false,error=false}:{items:TodayGoal[];selectedId?:string|null;onSelect:(id:string)=>void;series?:GoalDaySeries;seriesPending?:boolean;onManage:(scope:'Du'|'Crew')=>void;pending?:boolean;error?:boolean}){
 const selected=items.find(g=>g.id===selectedId)??items[0]
 const pct=selected?percent(selected):null
 const confirmedSeries=series&&selected?.personalKey===series.key&&(!selected.periodKey||selected.periodKey===series.period)?series:null
 return <div className="w3-today-goals" style={goalVars()}>
  {items.length>0&&<div className="w3-goal-picker" aria-label="Ziel auswählen">{items.map(goal=><button type="button" key={goal.id} aria-pressed={goal===selected} onClick={()=>onSelect(goal.id)}>{goal.title}{' '}<span>{goal.scope}</span></button>)}</div>}
  {selected?<>
   <div className="w3-goal-hero"><GoalRing goal={selected}/><div className="w3-goal-hero-values"><span>{selected.period}{selected.scope==='Crew'?' · dein Stand':''}</span><strong>{selected.value==null?'—':number(selected.value)}<small> {selected.unit}</small></strong><span>von {number(selected.target)} {selected.unit}</span></div></div>
   <div className="w3-goal-milestones" aria-label="Zielfortschritt">{Array.from({length:20},(_,i)=><span key={i} style={{background:T.rule}}><i style={{display:'block',height:'100%',width:`${pct==null?0:Math.max(0,Math.min(100,(pct-i*5)*20))}%`,background:T.acid}}/></span>)}</div>
   <div className="w3-goal-remaining"><strong>{selected.value==null?'Noch kein eigener Stand':pct===100?'Ziel erreicht':`Noch ${number(Math.max(0,selected.target-selected.value))} ${selected.unit}`}</strong>{selected.reward!=null&&<span>{pct===100?'Erreicht':'Zielprämie'} · {number(selected.reward)} RC</span>}</div>
   {selected.personalKey?(confirmedSeries?.days.length?<GoalDays key={`${selected.id}-${confirmedSeries.period}`} series={confirmedSeries} unit={selected.unit}/>:<p className="w3-goal-empty">{seriesPending?'Deine Beiträge werden geladen…':'Noch kein Tagesverlauf verfügbar.'}</p>):<div className="w3-goal-members" aria-label="Crew-Fortschritt je Mitglied">{selected.members?.slice(0,5).map(member=><div key={member.id}><span>{member.handle}</span><div><i style={{width:`${Math.max(0,Math.min(100,selected.target>0?member.value/selected.target*100:0))}%`}}/></div><strong>{number(member.value)} {selected.unit}</strong></div>)}</div>}
   <button type="button" className="w3-goal-manage" onClick={()=>onManage(selected.scope)}>{selected.scope==='Du'?'Ziel verwalten':'Crew-Ziel öffnen'}<ArrowUpRight size={15}/></button>
  </>:<p className="w3-goal-empty">{pending?'Ziele werden geladen…':error?'Ziele gerade nicht verfügbar.':'Ein Ziel gibt deinen Fahrten Richtung.'}</p>}
  <div className="w3-goal-actions"><button type="button" onClick={()=>onManage('Du')}><Plus size={15}/>Eigenes Ziel</button><button type="button" onClick={()=>onManage('Crew')}><Plus size={15}/>Crew-Ziel</button></div>
 </div>
}
export default function W3TodayGoals(){
 const goals=useGoals(),navigate=useNavigate()
 const [selectedId,setSelectedId]=useState<string|null>(null)
 const selected=goals.items.find(g=>g.id===selectedId)??goals.items[0]
 const days=useChallengeDays(selected?.personalKey??null)
 return <W3TodayGoalsView {...goals} selectedId={selectedId} onSelect={setSelectedId} series={days.data} seriesPending={!!selected?.personalKey&&days.isPending} onManage={scope=>navigate(scope==='Du'?'/e/w3-challenges':'/e/w3-crew')}/>
}

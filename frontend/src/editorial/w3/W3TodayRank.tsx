import {useId,useState,type CSSProperties} from 'react'
import {AnimatePresence,motion,useReducedMotion} from 'motion/react'
import {useNavigate} from 'react-router-dom'
import {ArrowUpRight,Info,Users} from 'lucide-react'
import {useMyCrew,useCrewStandings} from '../../hooks/useCrew'
import type {StandingRow,StandingsResponse} from '../../api/crew'
import {T,FONT} from './w3tokens'
import './w3TodayRank.css'

const number=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:0})
const WEEK=['Mo','Di','Mi','Do','Fr','Sa','So']

export function W3TodayRankView({crewName,rows,standings,pending=false,error=false}:{crewName:string|null;rows:StandingRow[];standings?:StandingsResponse|null;pending?:boolean;error?:boolean}){
 const [selected,setSelected]=useState<number|null>(null),[info,setInfo]=useState(false)
 const id=useId(),reduce=useReducedMotion(),navigate=useNavigate()
 const ordered=[...rows].sort((a,b)=>b.weekly_score-a.weekly_score)
 const me=ordered.find(r=>r.is_you)
 const shown=ordered.slice(0,8)
 if(me&&!shown.includes(me))shown[shown.length-1]=me
 const distance=rows.length&&rows.every(r=>r.distance_km!=null)?rows.reduce((sum,r)=>sum+(r.distance_km??0),0):null
 const vars={'--cr-ink':T.ink,'--cr-mid':T.mid,'--cr-soft':T.surface2,'--cr-rule':T.rule,'--cr-acid':T.acid,fontFamily:FONT} as CSSProperties
 return <div className="w3-crew-rank" style={vars}>
  <div className="w3-crew-intro"><div><h3>{crewName??'Deine Crew'}</h3><span>Wochenpunkte</span></div><button className="w3-crew-info-button" aria-label="Punktewertung erklären" aria-expanded={info} aria-controls={`${id}-scoring`} onClick={()=>setInfo(v=>!v)}><Info size={17}/></button></div>
  {pending?<p className="w3-crew-state" role="status">Crew wird geladen…</p>:error?<p className="w3-crew-state" role="alert">Die Rangliste ist gerade nicht verfügbar.</p>:!rows.length?<div className="w3-crew-state"><Users size={30} strokeWidth={1.3}/><p>{crewName?'Noch keine Wertung.':'Gemeinsam fahren.'}</p><button onClick={()=>navigate('/e/w3-crew')}>{crewName?'Zur Crew':'Crew finden'}<ArrowUpRight size={16}/></button></div>:<div className="w3-crew-table" aria-label="Crew-Rangliste">
   {shown.map(r=>{
    const rank=1+ordered.filter(other=>other.weekly_score>r.weekly_score).length,open=selected===r.user_id
    const days=r.daily_pct??[]
    return <div className="w3-crew-person" data-you={r.is_you} key={r.user_id}>
     <button className="w3-crew-person-toggle" aria-label={`${r.is_you?'Du':r.handle}, Platz ${rank}, ${number(r.weekly_score)} Punkte, Wochendetails`} aria-expanded={open} aria-controls={`${id}-${r.user_id}`} onClick={()=>setSelected(open?null:r.user_id)}>
      <span className="w3-crew-place">{rank}</span><span className="w3-crew-face">{r.avatar?<img src={r.avatar} alt=""/>:r.handle.slice(0,1).toUpperCase()}</span><span className="w3-crew-name">{r.is_you?'Du':r.handle}</span><strong>{number(r.weekly_score)}</strong>
     </button>
     <AnimatePresence initial={false}>{open&&<motion.div id={`${id}-${r.user_id}`} initial={{height:reduce?'auto':0,opacity:reduce?1:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduce?0:.22}} className="w3-crew-week">
      <div className="w3-crew-days" role="img" aria-label={`Tagespunkte: ${days.map((p,i)=>`${WEEK[i]??i+1} ${number(p)}`).join(', ')}`}>{WEEK.map((day,i)=><div key={day}><span className="w3-crew-day-track"><i style={{height:`${Math.max(3,Math.min(100,(days[i]??0)/150*100))}%`,opacity:(days[i]??0)>0?1:.2}}/></span><span>{day}</span></div>)}</div>
      <div className="w3-crew-person-stats">{r.distance_km!=null&&<span><b>{number(r.distance_km)}</b> km</span>}<span><b>{number(r.weekly_tss)}</b> TSS</span>{r.weekly_target_tss!=null&&r.weekly_target_tss>0&&<span><b>{number(r.weekly_tss/r.weekly_target_tss*100)} %</b> vom Ziel</span>}</div>
     </motion.div>}</AnimatePresence>
    </div>
   })}
  </div>}
  {distance!=null&&<div className="w3-crew-together"><strong>{number(distance)}<small>km</small></strong><span>gemeinsam</span></div>}
  {info&&<div id={`${id}-scoring`} className="w3-crew-explanation"><p>100 Punkte entsprechen dem persönlichen Tagesziel. Pro Tag zählen höchstens 150 Punkte. Deshalb vergleichen wir Zielerfüllung und nicht Trainingsstunden.</p>{me?.weekly_target_tss!=null&&<p>Dein Wochenziel: {number(me.weekly_target_tss)} TSS.{(me.daily_target_tss??standings?.daily_target_tss)!=null?` Tagesziel: ${number(me.daily_target_tss??standings!.daily_target_tss!)} TSS.`:''}</p>}</div>}
  {rows.length>0&&<button className="w3-crew-open" onClick={()=>navigate('/e/w3-crew')}>Zur Crew<ArrowUpRight size={17}/></button>}
 </div>
}
export default function W3TodayRank(){
 const crew=useMyCrew(),standings=useCrewStandings('week')
 return <W3TodayRankView crewName={crew.data?.crew?.name??null} rows={standings.data?.standings??[]} standings={standings.data} pending={crew.isPending||!!crew.data?.crew&&standings.isPending} error={crew.isError||!!crew.data?.crew&&standings.isError}/>
}

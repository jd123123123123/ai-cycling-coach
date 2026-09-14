import type { W3PlanVm } from '../editorial/w3/W3PlanView'
export type PlanState = 'empty' | 'created' | 'active' | 'ended'
export const phaseNames = ['Aufbau','Intensiv','Form','Erholung']
export const loads = [240,280,310,220,330,350,280,160]
export const durations = [240,270,300,210,330,360,300,180]
export const phaseAt = (w:number) => w < 3 ? 0 : w < 6 ? 1 : w === 6 ? 2 : 3
export const fmtTime = (minutes:number) => `${Math.floor(minutes / 60)}${minutes % 60 ? ':' + String(minutes % 60).padStart(2,'0') : ''} h`
export const weekDate = (w:number, end='2026-10-11') => {
  const d=new Date(new Date(`${end}T12:00:00Z`).getTime() + (w*7-55)*86400000)
  const e=new Date(d.getTime()+6*86400000)
  return `${d.getUTCDate()}.–${e.getUTCDate()}. ${e.toLocaleDateString('de-DE',{month:'short',timeZone:'UTC'})}`
}
export const weeks = loads.map((load,i)=>({load,minutes:durations[i],phase:phaseAt(i)}))
export const days = ['Mo','Di','Mi','Do','Fr','Sa','So']
export const sessions = [
 {title:'3 × 12′ Sweetspot',purpose:'Länger Druck auf dem Pedal halten.',minutes:75,tss:78,power:216,percent:90,kind:'Sweetspot',heights:[.26,.32,.4,.9,.9,.9,.3,.9,.9,.9,.3,.9,.9,.9,.3,.24]},
 {title:'Ruhetag',purpose:'Heute lässt du die Arbeit wirken.',minutes:0,tss:0,power:0,percent:0,kind:'Erholung',heights:[]},
 {title:'Ruhetag',purpose:'Frische für die nächste intensive Einheit.',minutes:0,tss:0,power:0,percent:0,kind:'Erholung',heights:[]},
 {title:'5 × 3′ VO₂max',purpose:'Mehr Reserve an kurzen Anstiegen.',minutes:60,tss:80,power:276,percent:115,kind:'VO₂max',heights:[.25,.35,.4,1.15,.3,1.15,.3,1.15,.3,1.15,.3,1.15,.3,.25]},
 {title:'Ruhetag',purpose:'Erholung gehört zu deinem Plan.',minutes:0,tss:0,power:0,percent:0,kind:'Erholung',heights:[]},
 {title:'Lange Grundlage',purpose:'Ausdauer für die zweite Hälfte der Tour.',minutes:150,tss:150,power:156,percent:65,kind:'Grundlage',heights:[.25,.35,.45,...Array(10).fill(.65),.45,.3]},
 {title:'Locker rollen',purpose:'Leichte Bewegung, ohne neue Ermüdung.',minutes:45,tss:22,power:120,percent:50,kind:'Regeneration',heights:[.25,.35,...Array(10).fill(.5),.35,.25]},
]
// The before view uses the shipped component with the same sample week as after.
export const beforeVm:W3PlanVm = {
 eventName:'FTP aufbauen',eventSub:'17. August – 11. Oktober 2026',daysToStart:null,weeksDaysLabel:'8 Wochen',planWeekLabel:'Planwoche 5 von 8',
 phases:phaseNames.map((name,i)=>({name,weeks:['W1–3','W4–6','W7','W8'][i],active:i===1})),railProgress:.5,planWeekNum:5,totalWeeks:8,
 reqSummary:'Länger Leistung halten',daysRight:'11. Oktober',phaseOfTotal:'Phase 2 von 4',
 block:{phase:'Intensiv',dateRange:'7.–27. September',weekOfBlock:'Woche 2 von 3',text:'Die intensiven Einheiten setzen einen gezielten Reiz. Die langen ruhigen Fahrten erhalten deine Ausdauer.',restNote:'Woche 8 ist eine Erholungswoche',tags:['Sweetspot','VO₂max'],next:'Danach: Form'},
 avgTss:'271',weekBars:loads.map((tss,i)=>({idx:i+1,tss,kind:i===4?'current':i<4?'done':'planned',isRest:i===3||i===7})),
 weekRangeLabel:weekDate(4),weekBadge:'0 / 4',weekStats:[{value:'5:30 h',label:'Zeit'},{value:'330',label:'TSS'},{value:'4',label:'Einheiten'},{value:'—',label:'Höhenmeter'}],
 dayStrip:sessions.map((s,i)=>({letter:days[i],date:String(14+i),frac:s.tss,isToday:i===0,isRest:!s.minutes})),
 daySessions:sessions.map((s,i)=>({title:s.minutes?s.title:null,weekday:days[i],dateLabel:`${days[i]}, ${14+i}. Sep.`,isToday:i===0,isPast:false,dur:s.minutes?fmtTime(s.minutes):null,tss:String(s.tss),targetW:`${s.power} W`,ftpPct:`${s.percent}%`,bars:s.heights.map(w=>({w,work:w>.8}))})),
 sessionTitle:sessions[0].title,sessionDur:'1:15 h',targetW:'216 W',sessionTss:'78',ftpPct:'90%',ftpTag:'FTP 240 W',sessionBars:sessions[0].heights.map(w=>({w,work:w>.8})),easierTss:'−15 TSS',harderTss:'+18 TSS',earnNote:'',forecastValue:'—',adaptExplainer:'Deine gefahrenen Einheiten und Erholungsdaten fließen in die nächsten Einheiten ein.',adjustDays:[true,false,false,true,false,true,true],adjustHours:6,adjustLongDay:5,goalOptions:[],
}

export type SampleSession = typeof sessions[number] & {warmup:number;workMinutes:number;repeats:number;recovery:number;cooldown:number}
// Deterministic design fixture, not a training prescription or backend plan engine.
export function sampleWeek(week:number,hours:number,available:boolean[],goal:string):SampleSession[]{
 const selected=available.flatMap((v,i)=>v?[i]:[])
 const total=Math.round(durations[week]*hours/6/5)*5
 const n=selected.length
 if(!n)return days.map(()=>({...sessions[1],warmup:0,workMinutes:0,repeats:0,recovery:0,cooldown:0}))
 const weights=n===1?[1]:n===2?[.4,.6]:n===3?[.25,.2,.55]:n===4?[75/330,60/330,150/330,45/330]:Array.from({length:n},(_,i)=>i===n-2?.35:.65/(n-1))
 const quality=[0,3,5,6,6,6,6]
 const remainingUnits=total/5-n
 const minuteParts=weights.map(w=>1+Math.floor(remainingUnits*w))
 let extra=total/5-minuteParts.reduce((sum,v)=>sum+v,0)
 const order=weights.map((w,i)=>({i,remainder:remainingUnits*w-Math.floor(remainingUnits*w)})).sort((a,b)=>b.remainder-a.remainder)
 for(let i=0;extra>0;i++,extra--)minuteParts[order[i%order.length].i]++
 let loadUsed=0
 const totalLoad=Math.round(loads[week]*hours/6)
 return days.map((_,d)=>{
  const at=selected.indexOf(d)
  if(at<0)return {...sessions[1],warmup:0,workMinutes:0,repeats:0,recovery:0,cooldown:0}
  const minutes=minuteParts[at]*5
  const tss=at===n-1?totalLoad-loadUsed:Math.round(totalLoad*(n===4?[78,80,150,22][at]/330:weights[at]));loadUsed+=tss
  let template=n===1?5:quality[at]
  if(goal==='endurance'||goal==='event'||goal==='custom')template=at===0?5:at===1?6:5
  if(goal==='vo2'&&at===0)template=3
  if(minutes<25)template=6
  const base=sessions[template]
  const hard=template===0||template===3
  const repeats=hard?(template===0?3:5):1
  const warmup=Math.min(15,Math.max(3,Math.round(minutes*.2)))
  const recovery=hard?Math.min(template===0?5:3,Math.max(1,Math.floor(minutes/15))):0
  const workMinutes=hard?Math.max(1,Math.min(template===0?12:3,Math.floor((minutes-warmup-recovery*(repeats-1)-5)/repeats))):Math.max(1,minutes-warmup-5)
  const cooldown=minutes-warmup-workMinutes*repeats-recovery*(repeats-1)
  return {...base,minutes,tss,title:hard?`${repeats} × ${workMinutes}′ ${base.kind}`:base.title,warmup,workMinutes,repeats,recovery,cooldown}
 })
}

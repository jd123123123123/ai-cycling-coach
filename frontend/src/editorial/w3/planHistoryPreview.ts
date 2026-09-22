import type {PlanHistoryDetail} from '../../api/planHistory'
/** Dev-only review examples, never a production history or a recovered record. */
const iso=(d:Date)=>d.toISOString().slice(0,10)
export const PLAN_HISTORY_PREVIEW:PlanHistoryDetail[]=Array.from({length:3},(_,j)=>{
 const end=new Date(Date.UTC(2026,7,16-j*56)),start=new Date(end.getTime()-55*86400000),baselineDate=iso(new Date(start.getTime()-86400000))
 const begin=222-j*12,now=begin+18-j*3,targets=[210,240,270,180,280,300,250,170],actual=[198,228,260,185,251,289,260,158]
 const dateAt=(d:number)=>iso(new Date(start.getTime()+d*86400000))
 const points=Array.from({length:5},(_,i)=>({date:dateAt(i*13),value:begin+(now-begin)*i/4,source:'Beispieldaten'}))
 const baseline={ftp:{date:baselineDate,value:begin,source:'Beispieldaten'},vo2:{date:baselineDate,value:46-j,source:'Beispieldaten'}}
 const progress={period:'plan' as const,plan_note:'Beispiel eines gespeicherten Plans',start:iso(start),end:iso(end),plan_start:iso(start),ftp:{baseline:baseline.ftp,current:now,target:null,points},vo2:{baseline:baseline.vo2,current:49-j,target:null,points:points.map((p,i)=>({...p,value:46-j+i*.75}))},records:[1,5,10,15,30,60,120,300,600,1200].map((s,i)=>({seconds:s,watts:1000-i*75-j*10,previous_watts:960-i*76-j*10,all_time_watts:1000-i*75-j*10,date:dateAt(50),activity_id:null}))}
 const totals={rides:28,km:1164-j*150,hours:48.6-j*5,ascent:12840-j*1300,tss:actual.reduce((s,v)=>s+v,0)}
 const days=Array.from({length:56},(_,i)=>({date:dateAt(i),title:i%7===1||i%7===4?'Ruhetag':i%7===5?'Lange Grundlage':'Sweetspot',duration:i%7===1||i%7===4?0:3600,tss:i%7===1||i%7===4?0:Math.round(targets[Math.floor(i/7)]/5)}))
 const rides=days.filter((_,i)=>![1,4,6].includes(i%7)).map((d,i)=>({id:-1-i,date:d.date,title:d.title,duration:3400+i*10,tss:d.tss-3}))
 const weeks=targets.map((t,i)=>({start:dateAt(i*7),end:dateAt(i*7+6),planned_tss:t,actual_tss:actual[i],rides:4,duration:21500}))
 return {id:`example-${j}`,title:['FTP + Ausdauer','VO₂max aufbauen','Frühlingskilometer'][j],start:iso(start),planned_end:iso(end),end:iso(end),status:j===2?'replaced':'completed',weeks:8,version_count:2,totals,baseline,progress,goal:{focuses:['threshold','endurance'],weekly_hours:6},revisions:[{saved_at:iso(start),schedule:{days,blocks:[{start:iso(start),end:dateAt(27),phase:'base2',weekly_tss:targets.slice(0,4)},{start:dateAt(28),end:iso(end),phase:'build1',weekly_tss:targets.slice(4)}]}}],outcome:{through:iso(end),totals,progress,weeks,rides,note:'Gemessene Veränderung im Planzeitraum. Keine Aussage über die alleinige Wirkung des Plans.'}}
})

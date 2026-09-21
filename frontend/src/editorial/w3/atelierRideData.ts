import { T } from './w3tokens'
import { gradeColour } from './gradeColours'
import { smoothCurve } from './w3SmoothCurve'

export type RideMetric = 'power' | 'heart_rate' | 'altitude' | 'cadence' | 'speed'
export type RideSample = Record<RideMetric, number | null> & { seconds: number; distance: number; grade: number | null }
export type FTPEntry = { date: string; watts: number; source: string }
export const METRICS: {key:RideMetric;label:string;unit:string;color:string}[] = [
 {key:'power',label:'Leistung',unit:'W',color:T.acid},
 {key:'heart_rate',label:'Puls',unit:'bpm',color:T.bad},
 {key:'altitude',label:'Höhe',unit:'m',color:T.ink},
 {key:'cadence',label:'Kadenz',unit:'rpm',color:T.cool},
 {key:'speed',label:'Tempo',unit:'km/h',color:T.training},
]
export const formatValue = (v:number|null|undefined, digits=0) => v==null||!Number.isFinite(v)?'—':v.toLocaleString('de-DE',{maximumFractionDigits:digits})
export const elapsed = (s:number) => `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}`

/** Time-weighted mean of interval samples. Missing intervals contribute no invented zero. */
export function rideMean(samples:RideSample[], metric:RideMetric){
 let sum=0,time=0
 for(let i=0;i<samples.length-1;i++){
  const value=samples[i][metric],dt=samples[i+1].seconds-samples[i].seconds
  if(value!=null&&Number.isFinite(value)&&dt>0){sum+=value*dt;time+=dt}
 }
 return time?sum/time:null
}
export function powerZone(value:number,ftp:number){return [0.55,.75,.90,1.05,1.20,1.50,Infinity].findIndex(edge=>value<=ftp*edge)}
export const POWER_COLORS=[T.cool,T.training,T.acid,T.warn,T.bad,T.evening,T.ink]
export type PlotSeries={points:({x:number;y:number}|null)[];color:string;dashed?:boolean;area?:boolean}
export type PlotModel={series:PlotSeries[];dots?:boolean;timeColors?:{offset:number;color:string}[];low:number;high:number;unit:string;xLabels:[string,string,string];marker?:{x:number;y:number;color:string};reference?:{value:number;label:string};bands?:{from:number;to:number;color:string}[]}
export const plotX=(x:number)=>14+x*310
export const plotY=(value:number,model:Pick<PlotModel,'low'|'high'>)=>180-(value-model.low)/Math.max(1,model.high-model.low)*150
export function seriesPath(series:PlotSeries,model:PlotModel){return smoothCurve(series.points.map(p=>p?{x:plotX(p.x),y:plotY(p.y,model)}:null))}
export function ridePlot(samples:RideSample[],metric:RideMetric,selected:number|null,ftp:number|null,hrMax:number|null=null):PlotModel{
 const values=samples.flatMap(s=>s[metric]!=null&&Number.isFinite(s[metric])?[s[metric]!]:[])
 const config=METRICS.find(m=>m.key===metric)!
 const max=values.length?Math.max(...values):1,min=values.length?Math.min(...values):0
 const step=metric==='altitude'?500:metric==='power'?100:metric==='speed'?20:50
 const low=metric==='altitude'?Math.floor(min/step)*step:0,high=Math.max(low+step,Math.ceil(Math.max(max,metric==='power'?ftp??0:0)/step)*step)
 const first=samples[0]?.seconds??0,last=samples.at(-1)?.seconds??1
 const at=(p:RideSample)=>(p.seconds-first)/Math.max(1,last-first)
 const current=selected==null?null:samples[selected]
 return {low,high,unit:config.unit,timeColors:metric==='altitude'?samples.map(s=>({offset:at(s),color:s.grade==null?T.mid:gradeColour(s.grade)})):undefined,xLabels:[elapsed(first),elapsed((first+last)/2),elapsed(last)],
  series:[{color:config.color,area:true,points:samples.map(s=>s[metric]==null?null:{x:at(s),y:s[metric]!})}],
  marker:current&&current[metric]!=null?{x:at(current),y:current[metric]!,color:config.color}:undefined,
  reference:metric==='power'&&ftp?{value:ftp,label:`FTP ${ftp} W`}:undefined,
  bands:metric==='power'&&ftp?[0,.55,.75,.9,1.05,1.2,1.5].map((edge,i)=>({from:edge*ftp,to:Math.min(high,([.55,.75,.9,1.05,1.2,1.5,Infinity][i])*ftp),color:POWER_COLORS[i]})).filter(b=>b.to>b.from):metric==='heart_rate'&&hrMax?[0,.6,.7,.8,.9].map((edge,i)=>({from:edge*hrMax,to:Math.min(high,[.6,.7,.8,.9,Infinity][i]*hrMax),color:POWER_COLORS[i]})).filter(b=>b.to>b.from):undefined,
 }
}
export function ftpWindow(entries:FTPEntry[],days:number,asOf:string){
 const end=Date.parse(`${asOf}T12:00:00Z`),start=end-(days-1)*86400000
 return entries.filter(e=>{const at=Date.parse(`${e.date}T12:00:00Z`);return at>=start&&at<=end&&Number.isFinite(e.watts)&&e.watts>0}).sort((a,b)=>a.date.localeCompare(b.date))
}
export function ftpPlot(entries:FTPEntry[],selected:number|null):PlotModel{
 const dates=entries.map(e=>Date.parse(e.date)),values=entries.map(e=>e.watts),lo=dates[0]??0,hi=dates.at(-1)??1
 const low=values.length?Math.floor((Math.min(...values)-5)/10)*10:0,high=values.length?Math.ceil((Math.max(...values)+5)/10)*10:100
 const points=entries.map((e,i)=>({x:hi===lo ? .5 :(dates[i]-lo)/(hi-lo),y:e.watts}))
 const fmt=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('de-DE',{day:'numeric',month:'short'})
 const p=selected==null?null:points[selected]
 return {low,high,unit:'W',dots:true,series:[{points,color:T.acid}],xLabels:[entries[0]?fmt(entries[0].date):'','',entries.at(-1)?fmt(entries.at(-1)!.date):''],marker:p?{...p,color:T.acid}:undefined}
}

// Fully synthetic preview streams: never substitute these for a missing device recording.
// Seven climbs; ascent matches the existing 5,639 hm demonstration summary.
export const ATELIER_SAMPLES:RideSample[]=(()=>{
 const points=Array.from({length:127},(_,i)=>({distance:138600*i/126,altitude:1400+5639/7*Math.sin(Math.PI*(i%18)/18)**2}))
 let seconds=0
 const rows=points.map((p,i)=>{
  const next=points[Math.min(i+1,126)],grade=i<126?(next.altitude-p.altitude)/(next.distance-p.distance)*100:0
  const speed=Math.max(12,32-grade*1.7),power=Math.max(0,Math.round(170+grade*14+Math.sin(i*2.7)*32))
  const row={...p,seconds,grade,power,heart_rate:Math.round(136+Math.max(0,grade)*3+Math.sin(i/3)*9),cadence:Math.round(80+Math.sin(i/4)*12),speed}
  if(i<126)seconds+=(next.distance-p.distance)/(speed/3.6)
  return row
 })
 const factor=17100/seconds
 return rows.map(r=>({...r,seconds:r.seconds*factor,speed:r.speed/factor}))
})()
export const ATELIER_FTP:FTPEntry[]=[
 {date:'2026-03-23',watts:252,source:'FTP-Test'}, {date:'2026-05-04',watts:258,source:'FTP-Test'},
 {date:'2026-06-29',watts:264,source:'FTP-Test'}, {date:'2026-07-20',watts:269,source:'FTP-Test'},
 {date:'2026-08-10',watts:266,source:'Manuell gesetzt'}, {date:'2026-08-31',watts:274,source:'FTP-Test'},
 {date:'2026-09-21',watts:280,source:'FTP-Test'},
]

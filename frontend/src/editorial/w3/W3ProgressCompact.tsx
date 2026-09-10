import { smoothCurve } from './w3SmoothCurve'
import { useProgressExplorer } from './W3ProgressAnalytics'
import type { CSSProperties } from 'react'
import { T } from './w3tokens'
import './w3ProgressCompact.css'
import type { ProgressExplorer, ProgressPoint, ProgressMetric, ProgressRecord } from '../../api/progressExplorer'
const fmt=(value:number|null)=>value==null?'—':value.toLocaleString('de-DE',{maximumFractionDigits:1})
function MiniHistory({points}:{points:ProgressPoint[]}) {
 if(points.length<2)return null
 const values=points.map(p=>p.value),lo=Math.min(...values),span=Math.max(1,Math.max(...values)-lo)
 const first=Date.parse(points[0].date),last=Date.parse(points.at(-1)!.date)
 const xy=points.map(p=>({x:3+(Date.parse(p.date)-first)/Math.max(86400000,last-first)*122,y:42-(p.value-lo)/span*30}))
 return <svg viewBox="0 0 130 50" style={{width:'100%',height:50,display:'block'}} role="img" aria-label={`Gespeicherter Verlauf von ${fmt(values[0])} auf ${fmt(values.at(-1)!)}`}><path d={smoothCurve(xy)} fill="none" stroke={T.acid} strokeWidth="1.8" strokeLinejoin="round"/><circle cx={xy.at(-1)!.x} cy={xy.at(-1)!.y} r="2.5" fill={T.acid}/></svg>
}
function MetricDelta({metric}:{metric?:ProgressMetric}) {
 const end=metric?.points.at(-1),baseline=metric?.baseline??(metric&&metric.points.length>1?metric.points[0]:null)
 if(!end||!baseline)return null
 const delta=end.value-baseline.value
 return <span className="w3-compact-change" style={{color:delta>0?T.acid:T.mid}} aria-label={`Veränderung seit ${baseline.date}: ${delta>0?'+':''}${fmt(delta)}`}>{delta>0?'↗':delta<0?'↘':'→'} {delta>0?'+':''}{fmt(delta)}</span>
}
function RecordPreview({records}:{records:ProgressRecord[]}) {
 if(records.filter(p=>p.watts!=null).length<2)return null
 const sorted=[...records].sort((a,b)=>a.seconds-b.seconds)
 const max=Math.max(1,...sorted.flatMap(p=>[p.watts??0,p.previous_watts??0]))
 const x=(v:number)=>4+Math.log(v/sorted[0].seconds)/Math.max(.01,Math.log(sorted.at(-1)!.seconds/sorted[0].seconds))*170
 const path=(key:'watts'|'previous_watts')=>smoothCurve(sorted.map(p=>p[key]==null?null:{x:x(p.seconds),y:42-p[key]!/max*34}))
 return <div className="w3-compact-records"><span>Rekorde</span><svg viewBox="0 0 178 48" role="img" aria-label="Leistungskurve im gewählten Monat und im vorherigen Zeitraum"><path d={path('previous_watts')} stroke={T.mid} opacity=".5" strokeDasharray="3 4" strokeWidth="1.3" fill="none"/><path d={path('watts')} stroke={T.acid} strokeWidth="1.8" fill="none"/></svg></div>
}
export function W3ProgressCompactView({data,fallbackFtp}:{data?:ProgressExplorer;fallbackFtp:number|null}) {
 const metrics=[{label:'FTP',value:data?.ftp.current??fallbackFtp,unit:'W',points:data?.ftp.points??[],metric:data?.ftp},{label:'VO₂max',value:data?.vo2.current??null,unit:'ml/kg/min',points:data?.vo2.points??[],metric:data?.vo2}]
 return <div className="w3-compact-progress" style={{'--pc-ink':T.ink,'--pc-mid':T.mid,'--pc-rule':T.rule,'--pc-soft':T.surface2} as CSSProperties}>
  <div className="w3-compact-performance">{metrics.map(metric=><div key={metric.label}><div className="w3-compact-metric-label"><span>{metric.label}</span><MetricDelta metric={metric.metric}/></div><strong>{fmt(metric.value)}<small>{metric.value==null?'':metric.unit}</small></strong><MiniHistory points={metric.points}/></div>)}</div>
  {data&&<RecordPreview records={data.records}/>}
 </div>
}
export default function W3ProgressCompact({fallbackFtp}:{fallbackFtp:number|null}) {
 const {data}=useProgressExplorer('month')
 return <W3ProgressCompactView data={data} fallbackFtp={fallbackFtp}/>
}

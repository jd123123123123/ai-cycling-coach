import { useProgressExplorer } from './W3ProgressAnalytics'
import { T } from './w3tokens'
import './w3ProgressCompact.css'
import type { ProgressExplorer, ProgressPoint, ProgressRecord } from '../../api/progressExplorer'
const fmt=(value:number|null)=>value==null?'—':value.toLocaleString('de-DE',{maximumFractionDigits:1})
function MiniHistory({points}:{points:ProgressPoint[]}) {
 if(points.length<2)return null
 const values=points.map(p=>p.value),lo=Math.min(...values),span=Math.max(1,Math.max(...values)-lo)
 const first=Date.parse(points[0].date),last=Date.parse(points.at(-1)!.date)
 const xy=points.map(p=>`${3+(Date.parse(p.date)-first)/Math.max(86400000,last-first)*88},${28-(p.value-lo)/span*20}`)
 return <svg viewBox="0 0 94 32" style={{width:'100%',height:30,display:'block'}} role="img" aria-label={`Gespeicherter Verlauf von ${fmt(values[0])} auf ${fmt(values.at(-1)!)}`}><polyline points={xy.join(' ')} fill="none" stroke={T.acid} strokeWidth="1.7" strokeLinejoin="round"/><circle cx={xy.at(-1)!.split(',')[0]} cy={xy.at(-1)!.split(',')[1]} r="2.5" fill={T.acid}/></svg>
}
function MiniRecords({records}:{records:ProgressRecord[]}) {
 const current=records.filter(r=>r.watts!=null)
 if(current.length<2)return null
 const max=Math.max(1,...records.flatMap(r=>[r.watts??0,r.previous_watts??0]))
 const x=(seconds:number)=>4+Math.log(seconds/5)/Math.log(3600/5)*284
 const y=(watts:number)=>40-watts/max*34
 const curve=(field:'watts'|'previous_watts')=>{let gap=true;return records.map(r=>{if(r[field]==null){gap=true;return ''}const p=`${gap?'M':'L'}${x(r.seconds)},${y(r[field]!)}`;gap=false;return p}).join(' ')}
 const picked=records.find(r=>r.seconds===300)
 return <svg viewBox="0 0 296 46" style={{width:'100%',height:42,display:'block',marginTop:5}} role="img" aria-label="Leistungskurve dieses Monats; gestrichelt der vorherige Vergleichszeitraum"><path d={curve('previous_watts')} stroke={T.mid} strokeWidth="1.2" strokeDasharray="3 3" fill="none"/><path d={curve('watts')} stroke={T.acid} strokeWidth="1.6" fill="none"/>{picked?.watts!=null&&<circle cx={x(300)} cy={y(picked.watts)} r="2.8" fill={T.acid}/>}</svg>
}
export function W3ProgressCompactView({data,fallbackFtp}:{data?:ProgressExplorer;fallbackFtp:number|null}) {
 const record=data?.records.find(r=>r.seconds===300)
 const metrics=[{label:'FTP',value:data?.ftp.current??fallbackFtp,unit:'W',points:data?.ftp.points??[]},{label:'VO₂max',value:data?.vo2.current??null,unit:'ml/kg/min',points:data?.vo2.points??[]}]
 return <div className="w3-compact-progress">
  <div className="w3-compact-performance">{metrics.map(metric=><div key={metric.label}><span>{metric.label}</span><strong>{fmt(metric.value)}<small>{metric.value==null?'':metric.unit}</small></strong><MiniHistory points={metric.points}/></div>)}</div>
  <div className="w3-compact-record"><span>Rekorde</span>{record?.watts!=null?<strong>5 min <b>{fmt(record.watts)} W</b></strong>:<span>Deine Leistungskurve →</span>}</div><MiniRecords records={data?.records??[]}/>
 </div>
}
export default function W3ProgressCompact({fallbackFtp}:{fallbackFtp:number|null}) {
 const {data}=useProgressExplorer('month')
 return <W3ProgressCompactView data={data} fallbackFtp={fallbackFtp}/>
}

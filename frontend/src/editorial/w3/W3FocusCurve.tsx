import {useId} from 'react'
import {T} from './w3tokens'
export function curvePath(points:number[][]){return points.map((p,i)=>{if(!i)return `M${p[0]},${p[1]}`;const prev=points[i-1],mid=(prev[0]+p[0])/2;return `C${mid},${prev[1]} ${mid},${p[1]} ${p[0]},${p[1]}`}).join(' ')}
export default function W3FocusCurve({values,labels,selected,onSelect,target,forecast,elapsed=0.75}:{values:number[];labels:string[];selected:number|null;onSelect:(i:number|null)=>void;target?:number;forecast?:number;elapsed?:number}){
 const id=useId(),max=Math.max(1,...values,target??0,forecast??0),future=forecast!=null
 const span=future?316*Math.max(0,Math.min(1,elapsed)):316,points=values.map((v,i)=>[12+i/Math.max(1,values.length-1)*span,152-v/max*125])
 const last=points.at(-1),line=curvePath(points),active=points[selected??values.length-1]
 return <div className="focus-curve" data-w3-graph data-empty={!values.some(v=>v>0)||undefined}><svg viewBox="0 0 340 175" preserveAspectRatio="none" role="img" aria-label="Kumulierte Kilometer im gewählten Zeitraum">
 <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor={T.acid} stopOpacity=".15"/><stop offset="1" stopColor={T.acid} stopOpacity="0"/></linearGradient></defs>
 {[.33,.66,1].map(f=><line key={f} x1="12" x2="328" y1={152-f*125} y2={152-f*125} stroke={T.rule}/>)}
 {target!=null&&<line x1="12" x2="328" y1={152-target/max*125} y2={152-target/max*125} stroke={T.quiet} strokeDasharray="3 5"/>}
 {last&&<><path d={`${line}L${last[0]},152H12Z`} fill={`url(#${id})`}/><path d={line} fill="none" stroke={T.acid} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>{future&&<path d={`M${last[0]},${last[1]}L328,${152-forecast/max*125}`} fill="none" stroke={T.acid} strokeWidth="2" strokeDasharray="3 5"/>}</>}
 {active&&<><line x1={active[0]} x2={active[0]} y1={active[1]} y2="152" stroke={T.rule}/><circle cx={active[0]} cy={active[1]} r="4" fill={T.ink} stroke={T.bg} strokeWidth="2"/></>}
 </svg><div className="focus-curve-targets" style={{right:future?`${(1-elapsed)*100}%`:0}} role="group" aria-label="Zeitraum im Diagramm wählen">{values.map((v,i)=><button key={i} aria-label={`${labels[i]}: ${Math.round(v).toLocaleString('de-DE')} km kumuliert`} aria-pressed={selected===i} onClick={()=>onSelect(selected===i?null:i)}/>)}</div><div className="focus-curve-axis"><span>{labels[0]}</span><span>{future?'Jahresende':labels.at(-1)}</span></div></div>
}

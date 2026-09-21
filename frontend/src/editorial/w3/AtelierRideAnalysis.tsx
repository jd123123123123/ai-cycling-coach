import { useId, type CSSProperties, type PointerEvent } from 'react'
import { ArrowUpRight, Info } from 'lucide-react'
import { T } from './w3tokens'
import { gradeColour } from './gradeColours'
import { smoothCurve } from './w3SmoothCurve'
import { elapsed, formatValue as f, METRICS, plotX, plotY, powerZone, POWER_COLORS, rideMean, ridePlot, seriesPath, ftpPlot, type FTPEntry, type PlotModel, type RideMetric, type RideSample } from './atelierRideData'

/** SVG-only chart: the same geometry is used in the screen and exported story. */
export function AtelierPlot({model,onInspect,label='Messverlauf'}:{model:PlotModel;onInspect?:(x:number)=>void;label?:string}){
 const id=useId().replace(/:/g,'')
 const pointer=(e:PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();onInspect?.(Math.max(0,Math.min(1,((e.clientX-r.left)/r.width*340-14)/310)))}
 return <svg viewBox="0 0 340 220" role="img" aria-label={label} className="atelier-data-plot" style={{touchAction:'pan-y'}} onPointerDown={onInspect?e=>{e.stopPropagation();pointer(e);e.currentTarget.setPointerCapture?.(e.pointerId)}:undefined} onPointerMove={onInspect?e=>{if(e.buttons||e.pointerType==='mouse')pointer(e)}:undefined}>
  <defs><linearGradient id={`${id}fade`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={model.series[0]?.color??T.acid} stopOpacity=".22"/><stop offset="1" stopColor={T.bg} stopOpacity="0"/></linearGradient>
  <linearGradient id={`${id}zones`} x1="0" x2="0" y1="180" y2="30" gradientUnits="userSpaceOnUse">{model.bands?.flatMap((b,i)=>[<stop key={`${i}a`} offset={(b.from-model.low)/(model.high-model.low)} stopColor={b.color}/>,<stop key={`${i}b`} offset={(b.to-model.low)/(model.high-model.low)} stopColor={b.color}/>])}</linearGradient><linearGradient id={`${id}slope`} x1="14" x2="324" y1="0" y2="0" gradientUnits="userSpaceOnUse">{model.timeColors?.map((s,i)=><stop key={i} offset={s.offset} stopColor={s.color}/>)}</linearGradient></defs>
  {[model.low,(model.high+model.low)/2,model.high].map(v=><g key={v}><line x1="14" x2="324" y1={plotY(v,model)} y2={plotY(v,model)} stroke={T.rule}/><text x="14" y={plotY(v,model)-7} fill={T.mid} fontSize="10">{f(v)} {model.unit}</text></g>)}
  {model.reference&&<g><line x1="14" x2="324" y1={plotY(model.reference.value,model)} y2={plotY(model.reference.value,model)} stroke={T.ink} strokeOpacity=".55" strokeDasharray="3 5"/><text x="324" y={plotY(model.reference.value,model)-8} fill={T.ink} textAnchor="end" fontSize="10">{model.reference.label}</text></g>}
  {model.series.map((series,i)=>{
   const runs: {x:number;y:number}[][]=[];let run:{x:number;y:number}[]=[]
   for(const p of series.points){if(p){run.push(p)}else if(run.length){runs.push(run);run=[]}}
   if(run.length)runs.push(run)
   return <g key={i}>{series.area&&runs.filter(r=>r.length>1).map((r,j)=><path key={j} d={`${smoothCurve(r.map(p=>({x:plotX(p.x),y:plotY(p.y,model)})))} L${plotX(r.at(-1)!.x)},180 L${plotX(r[0].x)},180Z`} fill={`url(#${id}fade)`}/>)}<path d={seriesPath(series,model)} fill="none" stroke={model.timeColors?.length&&i===0?`url(#${id}slope)`:model.bands?.length&&i===0?`url(#${id}zones)`:series.color} strokeWidth={series.dashed?1.5:2.5} strokeDasharray={series.dashed?'4 5':undefined} strokeLinejoin="round" strokeLinecap="round"/>{(model.dots||series.points.filter(p=>p!=null).length===1)&&series.points.map((p,j)=>p&&<circle key={j} cx={plotX(p.x)} cy={plotY(p.y,model)} r="3.5" fill={series.color} stroke={T.bg} strokeWidth="1.5"/>)}</g>
  })}
  {model.marker&&<g><line x1={plotX(model.marker.x)} x2={plotX(model.marker.x)} y1="20" y2="185" stroke={T.ink} opacity=".5"/><circle cx={plotX(model.marker.x)} cy={plotY(model.marker.y,model)} r="7" fill={T.bg}/><circle cx={plotX(model.marker.x)} cy={plotY(model.marker.y,model)} r="4" fill={model.marker.color}/></g>}
  {model.xLabels.map((text,i)=><text key={i} x={[14,169,324][i]} y="211" textAnchor={i===0?'start':i===2?'end':'middle'} fill={T.mid} fontSize="11">{text}</text>)}
 </svg>
}

export function AtelierRideAnalysis({samples,metric,selected,ftp,hrMax=null,onMetric,onSelect}:{samples:RideSample[];metric:RideMetric;selected:number|null;ftp:number|null;hrMax?:number|null;onMetric:(m:RideMetric)=>void;onSelect:(i:number|null)=>void}){
 const config=METRICS.find(m=>m.key===metric)!,model=ridePlot(samples,metric,selected,ftp,hrMax)
 const values=samples.flatMap(p=>p[metric]==null?[]:[p[metric]!]),point=selected==null?null:samples[selected]
 const value=point?point[metric]:metric==='altitude'?(values.length?Math.max(...values):null):rideMean(samples,metric)
 const zone=metric==='power'&&value!=null&&ftp?powerZone(value,ftp):metric==='heart_rate'&&value!=null&&hrMax?[.6,.7,.8,.9,Infinity].findIndex(edge=>value<=edge*hrMax):null
 const accent=zone!=null?POWER_COLORS[zone]:config.color
 const first=samples[0]?.seconds??0,last=samples.at(-1)?.seconds??0
 const inspect=(at:number)=>{const time=first+at*(last-first);onSelect(samples.reduce((best,p,i)=>Math.abs(p.seconds-time)<Math.abs(samples[best].seconds-time)?i:best,0))}
 const alt=samples.flatMap(p=>p.altitude==null?[]:[p.altitude]),lo=alt.length?Math.min(...alt):0,hi=alt.length?Math.max(...alt):1
 const elevation=samples.map(p=>p.altitude==null?null:{x:14+(p.seconds-first)/Math.max(1,last-first)*310,y:63-(p.altitude-lo)/Math.max(1,hi-lo)*45})
 return <div className="atelier-analysis" style={{'--analysis-accent':accent} as CSSProperties}>
  <div className="atelier-metric-tabs" aria-label="Analyse auswählen">{METRICS.map(m=><button key={m.key} aria-pressed={metric===m.key} onClick={()=>onMetric(m.key)}>{m.label}</button>)}</div>
  <div className="atelier-analysis-reading"><div><span>{point?`${elapsed(point.seconds)} h · ${f(point.distance/1000,1)} km`:metric==='altitude'?'Höchster Punkt':'Fahrtdurchschnitt'}</span><strong>{f(value,metric==='speed'?1:0)}<small>{config.unit}</small></strong></div><div className="atelier-analysis-context">{zone!=null?<><b style={{color:accent}}>Z{zone+1}</b><span>{f(value!/(metric==='heart_rate'?hrMax!:ftp!)*100)} % {metric==='heart_rate'?'HFmax':'FTP'}</span></>:point?.grade!=null?<><b style={{color:gradeColour(point.grade)}}>{point.grade>0?'+':''}{f(point.grade,1)}%</b><span>Steigung</span></>:<button onClick={()=>onSelect(values.length?samples.reduce((b,p,i)=>(p[metric]??-Infinity)>(samples[b][metric]??-Infinity)?i:b,0):null)} disabled={!values.length} aria-label="Höchsten Messwert auswählen"><ArrowUpRight size={18}/><span>Spitze</span></button>}</div></div>
  {values.length>1?<AtelierPlot model={model} onInspect={inspect} label={`${config.label} über die Fahrzeit, ${config.unit}`}/>:<p className="atelier-empty">Kein {config.label.toLowerCase()}verlauf aufgezeichnet.</p>}
  <div className="atelier-linked-elevation">{metric==='altitude'&&<div className="atelier-grade-key">{[0,6,9,13].map(g=><span key={g}><i style={{background:gradeColour(g)}}/>{g}{g===13?'+':''} %</span>)}</div>}<span>Höhenprofil <small>{f(lo)}–{f(hi)} m</small></span>{alt.length>1?<svg viewBox="0 0 340 74" aria-label="Höhenprofil auf derselben Zeitachse" role="img"><path d={smoothCurve(elevation)} fill="none" stroke={T.mid} strokeWidth="1.5"/>{elevation.slice(1).map((p,i)=>p&&elevation[i]?<path key={i} d={`M${elevation[i]!.x},${elevation[i]!.y}L${p.x},${p.y}`} stroke={samples[i].grade==null?T.mid:gradeColour(samples[i].grade!)} strokeWidth="2" fill="none"/>:null)}{point&&<line x1={plotX((point.seconds-first)/Math.max(1,last-first))} x2={plotX((point.seconds-first)/Math.max(1,last-first))} y1="8" y2="68" stroke={T.ink}/>}</svg>:<p>Kein Höhenverlauf.</p>}</div>
  {samples.length>1&&<input type="range" className="atelier-scrub" min="0" max={samples.length-1} value={selected??0} aria-label="Zeitpunkt der Fahrt auswählen" aria-valuetext={point?`${elapsed(point.seconds)} Stunden, ${f(value)} ${config.unit}`:'Durchschnitt'} onChange={e=>onSelect(Number(e.target.value))}/>}
  <div className="atelier-linked-values" aria-live="polite">{(['power','heart_rate','cadence'] as const).map(key=><div key={key}><span>{METRICS.find(m=>m.key===key)!.label}</span><strong>{f(point?point[key]:rideMean(samples,key))}<small>{METRICS.find(m=>m.key===key)!.unit}</small></strong></div>)}</div>
  <div className="atelier-analysis-foot">{selected!=null?<button onClick={()=>onSelect(null)}>Zurück zum Durchschnitt</button>:<span/>}<span>{metric==='power'&&ftp?`FTP zur Fahrt ${ftp} W`:metric==='heart_rate'&&hrMax?`Pulszonen / HFmax ${hrMax}`:'Zeitachse in Stunden'}</span></div>
 </div>
}

export function AtelierFTPHistory({entries,days,selected,onDays,onSelect}:{entries:FTPEntry[];days:number;selected:number|null;onDays:(n:number)=>void;onSelect:(n:number|null)=>void}){
 const last=entries.at(-1),first=entries[0],active=selected==null?last:entries[selected]??last
 const delta=last&&first&&entries.length>1?last.watts-first.watts:null
 const inspect=(x:number)=>{if(!entries.length)return;const model=ftpPlot(entries,null);onSelect(model.series[0].points.reduce((best,p,i)=>p&&Math.abs(p.x-x)<Math.abs(model.series[0].points[best]!.x-x)?i:best,0))}
 return <div className="atelier-ftp-history">
  <div className="atelier-range" aria-label="Zeitraum wählen">{[30,90,180].map(n=><button key={n} aria-pressed={days===n} onClick={()=>onDays(n)}>{n} Tage</button>)}</div>
  <div className="atelier-analysis-reading"><div><span>{selected==null?'Zuletzt gespeicherte FTP':active?.date}</span><strong>{f(active?.watts)}<small>W</small></strong></div>{delta!=null&&<div className="atelier-analysis-context"><b className={delta>0?'is-positive':''}>{delta>0?'+':''}{f(delta)} W</b><span>im Zeitraum</span></div>}</div>
  {entries.length?<AtelierPlot model={ftpPlot(entries,selected)} onInspect={inspect} label="Gespeicherte FTP-Werte über Kalenderzeit, Detailachse in Watt"/>:<p className="atelier-empty">Keine FTP-Werte in diesem Zeitraum.</p>}
  <div className="atelier-ftp-points" aria-label="FTP-Messung auswählen">{entries.map((e,i)=><button key={e.date} aria-pressed={active===e} aria-label={`${e.date}: ${e.watts} Watt, ${e.source}`} onClick={()=>onSelect(i)}><i/><span>{new Date(`${e.date}T12:00:00`).toLocaleDateString('de-DE',{day:'numeric',month:'numeric'})}</span></button>)}</div>
  <details className="atelier-evidence-note"><summary>{active?.source??'Keine Messung'}{active?` · ${new Date(`${active.date}T12:00:00`).toLocaleDateString('de-DE')}`:''}<Info size={14}/></summary><p>Gespeicherte Werte, kein FTP-Gewinn aus einer einzelnen Fahrt. Die Linie verbindet die vorhandenen Einträge.</p></details>
 </div>
}

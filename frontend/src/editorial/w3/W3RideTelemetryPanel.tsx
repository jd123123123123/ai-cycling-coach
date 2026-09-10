import {useEffect,useId,useRef,useState,type CSSProperties,type PointerEvent} from 'react'
import {motion,useReducedMotion} from 'motion/react'
import {useQuery} from '@tanstack/react-query'
import {X,Info,ArrowUpRight} from 'lucide-react'
import {fetchCrewRideTelemetry,type CrewRide,type CrewRideTelemetry,type CrewTelemetryMetric} from '../../api/crewRides'
import {smoothCurve,type CurvePoint} from './w3SmoothCurve'
import {distanceDomain,GRADE_BANDS,TELEMETRY_ZONE_COLORS,telemetryZone} from './w3RideTelemetryModel'
import {T,FONT} from './w3tokens'
import './w3RideTelemetry.css'

const METRICS=[['power','Leistung','W'],['heart_rate','Puls','bpm'],['altitude','Höhe','m'],['cadence','Trittfrequenz','rpm']] as const
const fmt=(n:number|null|undefined)=>n==null?'—':n.toLocaleString('de-DE',{maximumFractionDigits:0})
const decimal=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const gradeText=(n:number|null|undefined)=>n==null?'—':`${n>0?'+':''}${decimal(n)} %`
const BASIS={ftp_history:'FTP zur Fahrt',ftp_current:'Aktuelle FTP',lthr_current:'Aktuelle Pulsschwelle',hrmax_current:'Aktueller Maximalpuls'}
function chartScale(values:number[],altitude:boolean){
 const min=Math.min(...values),max=Math.max(...values),raw=Math.max(12,max-min)/3
 const magnitude=10**Math.floor(Math.log10(raw)),step=([1,2,2.5,5,10].find(n=>n*magnitude>=raw)??10)*magnitude
 const low=Math.max(altitude?-Infinity:0,Math.floor((min-step*.1)/step)*step)
 const high=Math.max(low+step,Math.ceil(max/step)*step)
 return {low,high}
}

export function W3RideTelemetryView({ride,data,pending=false,error=false,onClose}:{ride:CrewRide;data?:CrewRideTelemetry;pending?:boolean;error?:boolean;onClose:()=>void}){
 const [metric,setMetric]=useState<CrewTelemetryMetric>('power'),[selected,setSelected]=useState<number|null>(null),[filter,setFilter]=useState<number|null>(null),[info,setInfo]=useState(false)
 const chartRef=useRef<HTMLDivElement>(null),[width,setWidth]=useState(320)
 const uid=useId(),reduce=useReducedMotion()
 useEffect(()=>{
  const el=chartRef.current
  if(!el||typeof ResizeObserver==='undefined')return
  const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)setWidth(entry.contentRect.width)})
  observer.observe(el);return ()=>observer.disconnect()
 },[])
 const safe=data?.activity_id===ride.id?data:undefined,samples=safe?.samples??[]
 const [,label,unit]=METRICS.find(([key])=>key===metric)!
 const values=samples.flatMap(p=>p[metric]==null?[]:[p[metric]!])
 const zones=metric==='power'||metric==='heart_rate'?safe?.zones?.[metric]:undefined
 const isAltitude=metric==='altitude',hasGrade=isAltitude&&samples.some(p=>p.grade_pct!=null)
 const bands=zones?.bands??(hasGrade?GRADE_BANDS:[])
 const hue=(id:number)=>hasGrade?GRADE_BANDS[id-1]?.color??T.acid:TELEMETRY_ZONE_COLORS[id-1]??T.acid
 const recordedAverage=metric==='power'?ride.avg_power_w:metric==='heart_rate'?ride.avg_hr:null
 const average=recordedAverage??(values.length?values.reduce((a,b)=>a+b,0)/values.length:null)
 const point=selected==null?null:samples[selected]
 const value=selected==null?average:point?.[metric]??null
 const currentZone=telemetryZone(isAltitude?point?.grade_pct:value,bands)
 const accent=currentZone?hue(currentZone.id):T.acid
 const {low,high}=chartScale(values.length?values:[0,10],isAltitude)
 const left=8,right=width-12,top=28,bottom=222,height=258
 const domain=isAltitude?distanceDomain(samples):null
 const position=(p:typeof samples[number])=>domain?(p.distance!-domain.start)/(domain.end-domain.start):p.position
 const x=(p:number)=>left+p*(right-left),y=(v:number)=>bottom-(v-low)/(high-low)*(bottom-top)
 const runs:CurvePoint[][]=[]
 for(const sample of samples){
  const v=sample[metric]
  if(v==null){if(runs.at(-1)?.length)runs.push([]);continue}
  if(!runs.length)runs.push([])
  runs[runs.length-1].push({x:x(position(sample)),y:y(v)})
 }
 const path=runs.filter(r=>r.length>1).map(r=>smoothCurve(r)).join(' ')
 const area=runs.filter(r=>r.length>1).map(r=>`${smoothCurve(r)} L${r.at(-1)!.x},${bottom} L${r[0].x},${bottom} Z`).join(' ')
 const slices=samples.map((p,i)=>({p,start:i?x((position(samples[i-1])+position(p))/2):left,end:i<samples.length-1?x((position(p)+position(samples[i+1]))/2):right,zone:telemetryZone(isAltitude?p.grade_pct:p[metric],bands)}))
 const visibleBands=zones?.bands.map((z,i)=>({...z,lo:Math.max(low,i?zones.bands[i-1].upper??low:low),hi:Math.min(high,z.upper??high)})).filter(z=>z.hi>z.lo)??[]
 const activeBand=bands.find(z=>z.id===filter)
 const peakIndex=samples.reduce((best,p,i)=>(p[metric]??-Infinity)>(samples[best]?.[metric]??-Infinity)?i:best,0)
 const inspect=(e:PointerEvent<SVGSVGElement>)=>{
  const bounds=e.currentTarget.getBoundingClientRect();if(!bounds.width||!samples.length)return
  const at=(e.clientX-bounds.left)*width/bounds.width
  const next=samples.reduce((best,p,i)=>Math.abs(x(position(p))-at)<Math.abs(x(position(samples[best]))-at)?i:best,0)
  setSelected(prev=>prev===next?prev:next)
 }
 const focusX=point?x(position(point)):null
 const meanVisible=average!=null&&average>=low&&average<=high
 const filterRange=activeBand&&!isAltitude?`${filter===1?'0':`>${fmt(bands[(filter??1)-2]?.upper)}`}–${activeBand.upper==null?'∞':fmt(activeBand.upper)} ${unit}`:''
 const mini=samples.filter((_,i)=>i%Math.max(1,Math.ceil(samples.length/72))===0)
 return <div className="w3-telemetry-content" style={{'--rt-ink':T.ink,'--rt-mid':T.mid,'--rt-rule':T.rule,'--rt-soft':T.surface2,'--rt-acid':T.acid,'--rt-surface':T.surface,'--rt-accent':accent,fontFamily:FONT} as CSSProperties}>
  <header><h3>Fahrtanalyse</h3><div className="w3-telemetry-tools"><button aria-label="Über diese Daten" aria-expanded={info} aria-controls={`${uid}-info`} onClick={()=>setInfo(!info)}><Info size={15}/></button><button aria-label="Graphen einklappen" onClick={onClose}><X size={15}/></button></div></header>
  <div className="w3-telemetry-tabs" aria-label="Messwert auswählen">{METRICS.map(([key,name])=><button key={key} aria-pressed={metric===key} onClick={()=>{setMetric(key);setSelected(null);setFilter(null)}}>{metric===key&&<motion.span className="w3-telemetry-tab-active" layoutId={reduce?undefined:`${uid}-tab`} transition={{type:'spring',stiffness:440,damping:36,duration:reduce?0:undefined}}/>}<span>{name}</span></button>)}</div>
  <div className="w3-telemetry-stage">
   <div className="w3-telemetry-reading">
    <div><div className="w3-telemetry-number" aria-label={`${selected==null?'Durchschnitt':'Messabschnitt'}: ${fmt(value)} ${unit}`}>{selected==null&&<span className="w3-telemetry-average-sign">Ø</span>}<strong>{fmt(value)}<small>{unit}</small></strong></div>{currentZone&&!isAltitude&&<span className="w3-telemetry-current-zone" style={{color:accent}}>Z{currentZone.id} · {currentZone.name}</span>}</div>
    {point&&hasGrade?<div className="w3-telemetry-slope" aria-label="Steigung"><b style={{color:accent}}>{gradeText(point.grade_pct)}</b></div>:selected==null?<button className="w3-telemetry-peak" aria-label="Höchsten Messabschnitt auswählen" title="Spitze auswählen" disabled={!values.length} onClick={()=>{setSelected(peakIndex);setFilter(null)}}><b>{fmt(values.length?Math.max(...values):null)}<small>{unit}</small></b><ArrowUpRight size={14}/></button>:null}
   </div>
   <div ref={chartRef} className="w3-telemetry-chart">{pending?<p>Messwerte werden geladen…</p>:error?<p>Messwerte gerade nicht verfügbar.</p>:values.length<2?<p>Für {label} wurde kein Verlauf aufgezeichnet.</p>:<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label==='Leistung'?'Leistungs':label==='Höhe'?'Höhen':label}verlauf der Fahrt`} onPointerDown={e=>{inspect(e);e.currentTarget.setPointerCapture?.(e.pointerId)}} onPointerMove={e=>{if(e.pointerType==='mouse'||e.buttons)inspect(e)}}>
    <defs>
     <linearGradient id={`${uid}-color`} gradientUnits="userSpaceOnUse" x1={hasGrade?left:0} x2={hasGrade?right:0} y1={hasGrade?0:top} y2={hasGrade?0:bottom}>
      {hasGrade?slices.flatMap(({start,end,zone},i)=>[<stop key={`${i}a`} offset={(start-left)/(right-left)} stopColor={zone?hue(zone.id):T.mid}/>,<stop key={`${i}b`} offset={(end-left)/(right-left)} stopColor={zone?hue(zone.id):T.mid}/>]):visibleBands.length?[...visibleBands].reverse().flatMap(z=>[<stop key={`${z.id}a`} offset={(y(z.hi)-top)/(bottom-top)} stopColor={hue(z.id)}/>,<stop key={`${z.id}b`} offset={(y(z.lo)-top)/(bottom-top)} stopColor={hue(z.id)}/>]):<><stop stopColor={T.acid}/><stop offset="1" stopColor={T.acid}/></>}
     </linearGradient>
     <linearGradient id={`${uid}-fade`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="white" stopOpacity=".55"/><stop offset="1" stopColor="white" stopOpacity=".03"/></linearGradient>
     <mask id={`${uid}-mask`}><rect x="0" y={top} width={width} height={bottom-top} fill={`url(#${uid}-fade)`}/></mask>
     <clipPath id={`${uid}-area`}><path d={area}/></clipPath>
     <clipPath id={`${uid}-filter`}>{hasGrade?slices.filter(s=>filter==null||s.zone?.id===filter).map((s,i)=><rect key={i} x={s.start} y="0" width={Math.max(0,s.end-s.start)} height={height}/>):filter==null?<rect width={width} height={height}/>:visibleBands.filter(z=>z.id===filter).map(z=><rect key={z.id} x="0" y={y(z.hi)} width={width} height={y(z.lo)-y(z.hi)}/>)}</clipPath>
    </defs>
    {visibleBands.map(z=><g key={z.id}><rect x={left} y={y(z.hi)} width={right-left} height={y(z.lo)-y(z.hi)} fill={hue(z.id)} opacity={filter===z.id?0.1:0.025}/></g>)}
    {[low,high].map(v=><g key={v}><line x1={left} x2={right} y1={y(v)} y2={y(v)} className="w3-telemetry-grid"/><text x={right} y={y(v)+(v===high?-8:15)} textAnchor="end" className="w3-telemetry-axis">{fmt(v)}</text></g>)}
    <path d={area} fill={`url(#${uid}-color)`} opacity=".08"/>
    <g clipPath={`url(#${uid}-filter)`}>
     <path d={area} fill={`url(#${uid}-color)`} mask={`url(#${uid}-mask)`} opacity=".7"/>
     <g clipPath={`url(#${uid}-area)`} mask={`url(#${uid}-mask)`}>{Array.from({length:Math.ceil((right-left)/5)},(_,i)=><line key={i} x1={left+i*5} x2={left+i*5} y1={top} y2={bottom} stroke={`url(#${uid}-color)`} strokeWidth="1.25" opacity=".8"/>)}</g>
    </g>
    {meanVisible&&<><line x1={left} x2={right} y1={y(average)} y2={y(average)} className="w3-telemetry-mean"/><text x={left+3} y={y(average)-7} className="w3-telemetry-axis">Ø{selected!=null?` ${fmt(average)}`:''}</text></>}
    <path d={path} stroke={`url(#${uid}-color)`} strokeWidth="2.6" opacity={filter==null?1:.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    {filter!=null&&<path d={path} stroke={`url(#${uid}-color)`} strokeWidth="2.6" fill="none" clipPath={`url(#${uid}-filter)`} strokeLinecap="round"/>}
    {runs.filter(r=>r.length===1).map((r,i)=><circle key={i} cx={r[0].x} cy={r[0].y} r="2" fill={T.mid}/>)}
    {point&&focusX!=null&&<><line x1={focusX} x2={focusX} y1={top-10} y2={bottom+6} className="w3-telemetry-cursor"/>{point[metric]!=null&&<><circle cx={focusX} cy={y(point[metric]!)} r="8" fill={accent} opacity=".15"/><circle cx={focusX} cy={y(point[metric]!)} r="4" fill={accent} stroke={T.surface} strokeWidth="2"/></>}</>}
    {[0,.5,1].map(p=><text key={p} x={x(p)} y="251" textAnchor={p===0?'start':p===1?'end':'middle'} className="w3-telemetry-axis">{domain?`${decimal((domain.start+p*(domain.end-domain.start))/1000)} km`:`${Math.round(p*100)} %`}</text>)}
    {point&&<g transform={`translate(${Math.max(left,Math.min(right-60,(focusX??left)-30))},235)`}><rect width="60" height="23" rx="7" fill={T.ink}/><text x="30" y="15" textAnchor="middle" fill={T.bg} fontSize="10" fontWeight="600">{domain?`${decimal(point.distance!/1000)} km`:`${Math.round(point.position*100)} %`}</text></g>}
   </svg>}</div>
   {values.length>=2&&<div className="w3-telemetry-navigator"><svg viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true">{mini.map((p,i)=>{const v=p[metric],z=telemetryZone(isAltitude?p.grade_pct:v,bands);return v==null?null:<rect key={i} x={i*300/mini.length} y={31-(v-low)/(high-low)*26} width={Math.max(1,300/mini.length-1.5)} height={Math.max(2,(v-low)/(high-low)*26)} rx="1" fill={z?hue(z.id):T.acid} opacity=".55"/>})}</svg><input type="range" min="0" max={samples.length-1} value={selected??0} aria-label="Abschnitt der Fahrt auswählen" aria-valuetext={selected==null?'Durchschnitt':`${Math.round((point?.position??0)*100)} Prozent, ${fmt(value)} ${unit}`} onChange={e=>setSelected(Number(e.target.value))}/></div>}
  </div>
  {bands.length>0?<div className="w3-telemetry-zones"><div className="w3-telemetry-zone-buttons" style={{gridTemplateColumns:`repeat(${bands.length},minmax(0,1fr))`}}>{bands.map(z=><button key={z.id} aria-label={hasGrade?z.name:`Zone ${z.id}: ${z.name}`} aria-pressed={filter===z.id} style={{'--zone':hue(z.id)} as CSSProperties} onClick={()=>{setFilter(v=>v===z.id?null:z.id)}}><i/>{hasGrade?z.name:`Z${z.id}`}</button>)}</div><div className="w3-telemetry-caption" hidden={!activeBand&&selected==null}><span>{activeBand?`${hasGrade?'':`Z${activeBand.id} · `}${activeBand.name}${filterRange?` · ${filterRange}`:''}`:''}</span>{(filter!=null||selected!=null)&&<button onClick={()=>{setFilter(null);setSelected(null)}}>Zurück zu Ø</button>}</div></div>:<div className="w3-telemetry-caption"><span>{metric==='power'?'FTP fehlt':metric==='heart_rate'?'Pulszonen fehlen':isAltitude?'Steigungsdaten fehlen':''}</span>{selected!=null&&<button onClick={()=>setSelected(null)}>Zurück zu Ø</button>}</div>}
  {info&&<div id={`${uid}-info`} className="w3-telemetry-info">
   {zones&&<p>{BASIS[zones.basis]} · {fmt(zones.reference)} {unit}</p>}
   <p>{isAltitude?'Steigung aus Höhen- und Distanzunterschieden benachbarter Abschnitte. Zu kurze oder unvollständige Abschnitte bleiben ohne Steigungswert.':'Zonen beziehen sich auf den Rider dieser Fahrt.'} Die Kurve zeigt gemittelte Messabschnitte, Datenlücken bleiben offen.</p>
   <p>Ø Watt und Puls stammen aus der Fahrtzusammenfassung; andere Mittelwerte und Spitzen aus dem dargestellten Verlauf. {domain?'Horizontale Achse: aufgezeichnete Distanz.':'Horizontale Achse: Position im aufgezeichneten Verlauf (0–100 %).'}</p>
  </div>}
 </div>
}
export default function W3RideTelemetryPanel({ride,onClose}:{ride:CrewRide;onClose:()=>void}){
 const reduce=useReducedMotion()
 const query=useQuery({queryKey:['crew','ride-telemetry',ride.id],queryFn:()=>fetchCrewRideTelemetry(ride.id),staleTime:60_000,retry:1})
 return <motion.div className="w3-telemetry-panel" initial={{height:reduce?'auto':0,opacity:reduce?1:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduce?0:.25}} role="region" aria-label={`Fahrtanalyse: ${ride.title}`}><W3RideTelemetryView ride={ride} data={query.data} pending={query.isPending} error={query.isError} onClose={onClose}/></motion.div>
}

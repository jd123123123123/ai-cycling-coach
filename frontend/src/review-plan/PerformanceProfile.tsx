import {useId,useState} from 'react'
import {motion,useReducedMotion} from 'motion/react'
import {ArrowUpRight,Info,ArrowRight} from 'lucide-react'
import {AXES,focusFor,focusReason,nativeValue} from './profileModel'
import type {GoalBrief} from './profileModel'
import './profile.css'
const C={x:175,y:152},R=97
function point(i:number,r:number){const a=(-90+i*72)*Math.PI/180;return {x:C.x+Math.cos(a)*r,y:C.y+Math.sin(a)*r}}
function shape(values:(number|null)[]){return values.map((v,i)=>v===null?'':`${i===0||values[i-1]===null?'M':'L'} ${point(i,R*v).x} ${point(i,R*v).y}`).join(' ')+(values.every(v=>v!==null)?' Z':'')}
function arc(i:number){const a=(-90+i*72-20)*Math.PI/180,b=a+40*Math.PI/180,r=R+9;return `M ${C.x+Math.cos(a)*r} ${C.y+Math.sin(a)*r} A ${r} ${r} 0 0 1 ${C.x+Math.cos(b)*r} ${C.y+Math.sin(b)*r}`}
function wedge(i:number){const a=(-90+i*72-36)*Math.PI/180,b=a+72*Math.PI/180,r=140;return `M ${C.x} ${C.y} L ${C.x+Math.cos(a)*r} ${C.y+Math.sin(a)*r} A ${r} ${r} 0 0 1 ${C.x+Math.cos(b)*r} ${C.y+Math.sin(b)*r} Z`}
export default function PerformanceProfile({brief=null,goal='ftp',ended=false,onEvidence,onFocus,compact=false,subtitle}:{brief?:GoalBrief|null;goal?:string;ended?:boolean;onEvidence?:(context:{ended:boolean;noPower:boolean})=>void;onFocus?:()=>void;compact?:boolean;subtitle?:string}){
 const focus=focusFor(brief,goal),[mode,setMode]=useState<'focus'|'compare'>(ended?'compare':'focus'),[selected,setSelected]=useState(focus[0]??3),[noPower,setNoPower]=useState(false),uid=useId(),reduced=useReducedMotion()
 const values=AXES.map((a,i)=>noPower&&i!==4?null:(ended?a.after:a.current)/a.max)
 const baseline=AXES.map((a,i)=>noPower&&i!==4?null:a.before/a.max)
 const selectedAxis=AXES[selected],native=noPower&&selected!==4?null:(ended?selectedAxis.after:selectedAxis.current),difference=native===null?null:native-selectedAxis.before
 return <section className={`performance-profile ${compact?'compact':''}`}>
 <div className="profile-heading"><div><h2>{ended?'Deine Entwicklung':'Dein Leistungsprofil'}</h2><span>{subtitle??(ended?'Start → Abschluss':'Aufgezeichnet · letzte 90 Tage')}</span></div><button className="profile-info" aria-label="Datengrundlage und Skalen" onClick={()=>onEvidence?.({ended,noPower})}><Info size={18}/></button></div>
 {!ended&&<div className="profile-modes" aria-label="Profilansicht"><button aria-pressed={mode==='focus'} onClick={()=>setMode('focus')}>Stand & Fokus</button><button aria-pressed={mode==='compare'} onClick={()=>setMode('compare')}>Vorher / Jetzt</button></div>}
 <svg className="radar-chart" viewBox="0 0 350 303" role="group" aria-label="Leistungsprofil mit fünf Achsen. Keine Gesamtwertung."><defs><radialGradient id={`${uid}-fill`}><stop stopColor="#BFFF3C" stopOpacity=".28"/><stop offset="1" stopColor="#BFFF3C" stopOpacity=".04"/></radialGradient><radialGradient id={`${uid}-halo`}><stop stopColor="#BFFF3C" stopOpacity=".09"/><stop offset="1" stopColor="#BFFF3C" stopOpacity="0"/></radialGradient></defs><circle cx={C.x} cy={C.y} r="127" fill={`url(#${uid}-halo)`}/>
 {[.25,.5,.75,1].map(k=><circle key={k} cx={C.x} cy={C.y} r={R*k} fill="none" stroke="#BDC5B2" strokeOpacity={k===1?.28:.12} strokeDasharray={k===1?undefined:'2 5'}/>)}
 {AXES.map((_,i)=>{const p=point(i,R);return <line key={i} x1={C.x} y1={C.y} x2={p.x} y2={p.y} stroke="#C6CEBB" strokeOpacity=".14"/>})}
 {mode==='focus'&&focus.map(i=><path key={i} d={arc(i)} fill="none" stroke="#D6BDF5" strokeWidth="4" strokeLinecap="round"/>)}
 {mode==='compare'&&<path d={shape(baseline)} fill="none" stroke="#9AABA0" strokeWidth="1.6" strokeDasharray="4 4" strokeLinejoin="round"/>}
 <motion.path d={shape(values)} initial={false} animate={{d:shape(values)}} transition={{duration:reduced?0:.4}} fill={values.every(v=>v!==null)?`url(#${uid}-fill)`:'none'} stroke="#BFFF3C" strokeWidth="2" strokeLinejoin="round"/>
 {AXES.map((a,i)=>{const p=point(i,R*(values[i]??1)),label=i===4?{x:4,y:80}:point(i,R+33),anchor=i===0?'middle':i<3||i===4?'start':'end';return <g key={a.name} className="radar-axis" role="button" tabIndex={0} aria-label={`${a.name}: ${values[i]===null?'nicht belegt':nativeValue(i,ended?a.after:a.current)}${focus.includes(i)?', empfohlener Fokus':''}`} aria-pressed={selected===i} onClick={()=>setSelected(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(i)}}}><path d={wedge(i)} fill="transparent"/><circle cx={p.x} cy={p.y} r="20" fill="transparent"/>{values[i]===null?<><circle cx={p.x} cy={p.y} r="4" fill="#171b14" stroke="#A6ADA1"/><path d={`M${p.x-3} ${p.y+3}l6 -6`} stroke="#A6ADA1"/></>:<><circle cx={p.x} cy={p.y} r={selected===i?10:5} fill="#BFFF3C" opacity={selected===i?.16:1}/><circle cx={p.x} cy={p.y} r="4" fill="#BFFF3C" stroke="#E9FFBC" strokeWidth="1"/></>}
 <text x={label.x} y={label.y-2} textAnchor={anchor} fill={selected===i?'#ECFFD0':'#C5CCBF'} fontSize="14" fontWeight="500">{a.name}</text><text x={label.x} y={label.y+13} textAnchor={anchor} fill="#87967D" fontSize="11">{a.short}</text></g>})}
 </svg>
 <div className="profile-legend"><span><i/>{ended?'Abschluss':'Jetzt'}</span>{mode==='compare'?<span><i className="baseline"/>Planstart</span>:<span><i className="focus"/>Trainingsfokus</span>}<span className="legend-note">je Achse eigene Skala</span></div>
 <div className="profile-reading" key={selected}><div><span>{selectedAxis.name}</span><strong>{native===null?'Nicht belegt':nativeValue(selected,native)}</strong></div><div>{mode==='compare'&&difference!==null?<><span>seit Planstart</span><b className={difference>0?'gain':''}>{difference>0?'+':''}{difference}{selected===4?' min':' W'}</b></>:<><span>{focus.includes(selected)?'Empfohlener Fokus':'Ergänzender Bereich'}</span><b>{focus.includes(selected)?focus.indexOf(selected)===0?'Priorität 1':'Priorität 2':'Kein Hauptfokus'}</b></>}</div></div>
 <p className="profile-meaning">{mode==='focus'?focus.includes(selected)?focusReason(brief,selected):selectedAxis.description:native===null?'Es fehlt eine vergleichbare Messung. Ohne Messung keine Veränderung.':`${selectedAxis.short}: ${nativeValue(selected,selectedAxis.before)} → ${nativeValue(selected,native)}. ${difference===0?'Bisher keine belegte Veränderung.':selected===3?'Vergleichbares FTP-Testprotokoll.':selected===4?'Längere Tour aufgezeichnet.':'Beste aufgezeichnete Leistung.'}`}</p>
 {onFocus&&<button className="profile-focus-link" onClick={onFocus}>Ziel & Anforderungen<ArrowUpRight size={16}/></button>}
 {!compact&&<button className="profile-missing-toggle" onClick={()=>{setNoPower(v=>!v);setSelected(4)}}>{noPower?'Mit Leistungsdaten ansehen':'Ohne Leistungsmesser ansehen'}<ArrowRight size={13}/></button>}
 </section>
}

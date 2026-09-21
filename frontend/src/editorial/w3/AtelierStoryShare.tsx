import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { Download, Share2, X } from 'lucide-react'
import { T } from './w3tokens'
import { RIDR_LIME } from '../../components/RidrMark'
import { AtelierPlot } from './AtelierRideAnalysis'
import type { PlotModel } from './atelierRideData'
import { ContributionGraphic, type ContributionKey, type RideContributions } from './AtelierRideMeaning'

export type RideStory={title:string;eyebrow:string;value:string;unit:string;caption:string;date:string;plot?:PlotModel;comparisons?:{label:string;actual:number;planned:number|null;unit:string}[];contribution?:{before:string;after:string;unit:string;share:number|null};contributionData?:{data:RideContributions;selected:ContributionKey};zoneRing?:{seconds:number[];selected:number};routePath?:string;facts:{label:string;value:string}[];demo:boolean}
const short=(text:string,length:number)=>text.length>length?`${text.slice(0,length-1)}…`:text
export function StoryPoster({story,tall=false,route=false}:{story:RideStory;tall?:boolean;route?:boolean}){
 const h=tall?640:450,plotY=tall?260:200,plotH=tall?240:140
 return <svg xmlns="http://www.w3.org/2000/svg" width="1080" height={tall?1920:1350} viewBox={`0 0 360 ${h}`} role="img" aria-label={`RIDR Share-Karte: ${story.title}`}>
  <rect width="360" height={h} fill={T.bg}/>
  <g fill={T.ink} fontFamily="Arial, sans-serif">
   <text x="26" y="34" fontSize="10" letterSpacing="1.1" fill={T.mid}>{short(story.eyebrow.toUpperCase(),43)}</text>
   <text x="26" y="71" fontSize="25" letterSpacing="-.9">{short(story.title,28)}</text>
   <text x="26" y="94" fontSize="11" fill={T.mid}>{story.date}</text>
   {!story.contributionData&&<><text x="24" y={tall?187:164} fontSize={story.value.length>8?46:67} letterSpacing="-3">{story.value}<tspan fontSize="19" letterSpacing="0" fill={T.mid}> {story.unit}</tspan></text>
   <text x="26" y={tall?219:188} fontSize="11" fill={T.mid}>{short(story.caption,51)}</text></>}
   {route&&story.routePath?<svg x="20" y={plotY} width="320" height={plotH} viewBox="0 0 360 280"><path d={story.routePath} fill="none" stroke={T.acid} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/></svg>:story.plot?<svg x="18" y={plotY} width="324" height={plotH} viewBox="0 0 340 220"><AtelierPlot model={story.plot}/></svg>:null}
   {story.comparisons?.slice(0,2).map((p,i)=>{const max=Math.max(1,p.actual,p.planned??0),y=plotY+14+i*64;return <g key={p.label}><text x="26" y={y} fontSize="11">{p.label}</text>{[{label:'Plan',value:p.planned,color:T.mid},{label:'Gefahren',value:p.actual,color:T.acid}].map((row,j)=>row.value!=null&&<g key={row.label}><text x="26" y={y+17+j*17} fontSize="9" fill={T.mid}>{row.label}</text><rect x="80" y={y+11+j*17} width={181*row.value/max} height="5" rx="2.5" fill={row.color}/><text x="334" y={y+17+j*17} fontSize="11" textAnchor="end">{row.value.toLocaleString('de-DE')} {p.unit}</text></g>)}</g>})}
   {story.contributionData?<svg x="20" y={tall?140:108} width="320" height={tall?355:235} viewBox="0 0 340 368"><ContributionGraphic {...story.contributionData}/></svg>:story.contribution&&<g transform={`translate(26 ${plotY+30})`}><text y="0" fontSize="10" fill={T.mid}>Vorher</text><text x="308" y="0" textAnchor="end" fontSize="10" fill={T.mid}>Jetzt</text><text y="29" fontSize="23">{story.contribution.before}</text><text x="308" y="29" textAnchor="end" fontSize="23">{story.contribution.after}<tspan fontSize="12" fill={T.mid}> {story.contribution.unit}</tspan></text>{story.contribution.share!=null?<><rect y="49" width="308" height="14" rx="7" fill={T.surface2}/><path d={`M${308*(1-story.contribution.share)} 56H308`} stroke={T.acid} strokeWidth="14"/><text y="87" fontSize="11" fill={T.mid}>{(story.contribution.share*100).toLocaleString('de-DE',{maximumFractionDigits:1})} % deines Jahresstands aus dieser Fahrt.</text></>:<text y="64" fontSize="11" fill={T.mid}>Kein früherer Jahresstand verfügbar.</text>}</g>}
   {story.zoneRing&&<svg x="20" y={plotY} width="320" height={plotH} viewBox="0 0 160 140">{story.zoneRing.seconds.map((seconds,i)=>{const total=story.zoneRing!.seconds.reduce((s,n)=>s+n,0),before=story.zoneRing!.seconds.slice(0,i).reduce((s,n)=>s+n,0);return seconds>0&&<circle key={i} cx="80" cy="70" r="54" pathLength="100" transform="rotate(-90 80 70)" fill="none" stroke={i===story.zoneRing!.selected?T.acid:T.heroOff} strokeWidth={i===story.zoneRing!.selected?12:7} strokeDasharray={`${Math.max(.01,seconds/total*100-1.3)} ${100-Math.max(.01,seconds/total*100-1.3)}`} strokeDashoffset={-before/total*100}/>})}</svg>}
   <line x1="26" x2="334" y1={h-98} y2={h-98} stroke={T.rule}/>
   {story.facts.slice(0,3).map((fact,i)=><g key={fact.label}><text x={26+i*106} y={h-73} fontSize="15">{short(fact.value,15)}</text><text x={26+i*106} y={h-56} fontSize="9" fill={T.mid}>{short(fact.label,20)}</text></g>)}
   <g transform={`translate(25 ${h-38}) scale(.115)`}><path d="M54 176v-136h50a36 36 0 0 1 0 72h-50m46 0c32 16 38 40 72 28" fill="none" stroke={RIDR_LIME} strokeWidth="13.2" strokeLinecap="round" strokeLinejoin="round"/></g>
   <text x="53" y={h-19} fontSize="16" fontWeight="700" letterSpacing="1">RIDR</text>
   <text x="334" y={h-20} textAnchor="end" fontSize="9" fill={T.mid}>{story.demo?'ENTWURF / BEISPIELDATEN':'DEINE FAHRT. DEINE DATEN.'}</text>
  </g>
 </svg>
}
export function storySVG(story:RideStory,tall=false,route=false){return renderToStaticMarkup(<StoryPoster story={story} tall={tall} route={route}/>)}
async function posterPNG(svg:string,tall:boolean):Promise<Blob>{
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}))
 try{
  const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Bild konnte nicht gerendert werden.'));img.src=url})
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=tall?1920:1350
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Bildexport nicht unterstützt.')
  ctx.drawImage(img,0,0);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Bildexport fehlgeschlagen.')),'image/png'))
 }finally{URL.revokeObjectURL(url)}
}
export function AtelierStoryShare({story,onClose}:{story:RideStory;onClose:()=>void}){
 const [tall,setTall]=useState(false),[route,setRoute]=useState(false),[blob,setBlob]=useState<Blob|null>(null),[error,setError]=useState(''),[status,setStatus]=useState('')
 const dialog=useRef<HTMLDivElement>(null)
 useEffect(()=>{let live=true;setBlob(null);setError('');setStatus('');posterPNG(storySVG(story,tall,route),tall).then(b=>{if(live)setBlob(b)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[story,tall,route])
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
  document.body.style.overflow='hidden';dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
  return()=>{document.body.style.overflow=overflow;previous?.focus()}
 },[])
 const download=()=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ridr-${tall?'story':'post'}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setStatus('PNG gespeichert.')}
 const share=async()=>{if(!blob)return;const file=new File([blob],'ridr.png',{type:'image/png'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:story.title});setStatus('An die Teilen-Funktion übergeben.')}else download()}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setError('Teilen nicht verfügbar. Du kannst das PNG speichern.')}}
 return createPortal(<div className="atelier-share-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="atelier-share-title" className="atelier-share-dialog" onKeyDown={e=>{
  if(e.key==='Escape')onClose()
  if(e.key==='Tab'){const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
 }}><header><h2 id="atelier-share-title">Deine Fahrt als Story.</h2><button aria-label="Teilen schließen" onClick={onClose}><X size={20}/></button></header><div className="atelier-share-format"><button aria-pressed={!tall} onClick={()=>setTall(false)}>Post 4:5</button><button aria-pressed={tall} onClick={()=>setTall(true)}>Story 9:16</button></div><div className="atelier-poster-preview"><StoryPoster story={story} tall={tall} route={route}/></div>{story.routePath&&<label className="atelier-route-option"><input type="checkbox" checked={route} onChange={e=>setRoute(e.target.checked)}/> GPS-Routenform hinzufügen</label>}<div className="atelier-share-actions"><button disabled={!blob} onClick={download}><Download size={18}/> PNG</button><button disabled={!blob} onClick={share}><Share2 size={18}/> Teilen</button></div><p role="status">{error||status||(!blob?'Bild wird vorbereitet…':'1080 px · ohne Bedienelemente')}</p></div></div>,document.body)
}

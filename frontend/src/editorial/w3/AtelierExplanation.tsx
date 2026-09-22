import { Children, useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Info, X } from 'lucide-react'
import { T, FONT } from './w3tokens'

/** Explanations occupy the current screen, one thought at a time; they never grow it. */
export function AtelierExplanation({children,title='Was bedeutet das?',open:controlled,onClose}:{children:ReactNode;title?:string;open?:boolean;onClose?:()=>void}){
  const [opened,setOpened]=useState(false),[page,setPage]=useState(0),id=useId(),dialog=useRef<HTMLDivElement>(null)
  const open=controlled??opened,slides=Children.toArray(children).filter(Boolean)
  const close=()=>{setOpened(false);onClose?.()}
  useEffect(()=>{
    if(!open)return
    setPage(0)
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
    document.body.style.overflow='hidden';dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return()=>{document.body.style.overflow=overflow;previous?.focus()}
  },[open])
  const style={'--a-bg':T.bg,'--a-surface':T.surface,'--a-ink':T.ink,'--a-mid':T.mid,'--a-acid':T.acid,'--a-rule':T.rule,fontFamily:FONT} as CSSProperties
  return <>{controlled===undefined&&<button className="atelier-explain-trigger" onClick={()=>setOpened(true)}>{title}<Info size={14}/></button>}{open&&createPortal(<div className="atelier-explanation-backdrop" style={style} onClick={e=>{if(e.target===e.currentTarget)close()}}><div className="atelier-explanation" role="dialog" aria-modal="true" aria-labelledby={id} ref={dialog} onKeyDown={e=>{
    if(e.key==='Escape')close()
    if(e.key==='Tab'){const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
  }}><header><span>RIDR · Einordnung</span><button aria-label="Erklärung schließen" onClick={close}><X size={22}/></button></header><h2 id={id}>{title}</h2><div className="atelier-explanation-content" aria-live="polite" key={page}>{slides[page]}</div><footer><button aria-label="Vorherige Erklärung" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={20}/></button><span>{page+1} / {slides.length}</span><button aria-label={page===slides.length-1?'Erklärung abschließen':'Nächste Erklärung'} onClick={()=>page===slides.length-1?close():setPage(p=>p+1)}>{page===slides.length-1?'Verstanden':<ArrowRight size={20}/>}</button></footer></div></div>,document.body)}</>
}

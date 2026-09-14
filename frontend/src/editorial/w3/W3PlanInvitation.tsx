import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {useQuery} from '@tanstack/react-query'
import {ArrowRight,X} from 'lucide-react'
import {useAuth} from '../../contexts/AuthContext'
import {fetchCurrentPlan} from '../../api/plan'
import {claimGate,releaseGate} from './w3gates'
import {T,FONT} from './w3tokens'
import './w3PlanInvitation.css'
const GATE='plan-focus-invitation-v2'
const ROUTES=new Set(['/e/w3-today','/e/w3-rides','/e/w3-wins','/e/w3-biker','/e/w3-garage','/e/w3-plan'])
const seenKey=(id:number)=>`ridr:plan-invitation:v2:${id}`
export function PlanInvitationView({hasActivePlan,onClose,onCreate}:{hasActivePlan:boolean;onClose:()=>void;onCreate:()=>void}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const el=ref.current,focus=document.activeElement as HTMLElement|null;el?.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=overflow;focus?.focus?.({preventScroll:true})}},[])
 return <dialog ref={ref} className="w3-plan-invitation" style={{'--invite-bg':T.bg,'--invite-ink':T.ink,'--invite-muted':T.mid,'--invite-acid':T.acid,'--invite-rule':T.stroke,fontFamily:FONT} as CSSProperties} aria-labelledby="plan-invitation-title" onCancel={e=>{e.preventDefault();onClose()}}>
 <header><span>Neu · Dein Trainingsplan</span><button onClick={onClose} aria-label="Hinweis schließen" autoFocus><X size={20}/></button></header>
 <div className="w3-plan-invitation-art" aria-hidden="true"><svg viewBox="0 0 320 148" fill="none"><path d="M4 133C68 133 68 92 131 92S210 24 316 24"/><path d="M4 133C67 133 86 117 145 99S222 77 316 64"/><path d="M4 133C54 133 88 135 152 119S236 110 316 103"/></svg><div><span>Ausdauer</span><span>FTP</span><span>VO₂max</span></div></div>
 <h2 id="plan-invitation-title">Dein Training.<br/>Deine Richtung.</h2>
 <p>{hasActivePlan?'Verbinde deine Schwerpunkte in einem Plan – auch ohne Eventdatum.':'Ausdauer, FTP, VO₂max. Wähle, was du verbessern möchtest – einzeln oder kombiniert.'}</p>
 <button className="w3-plan-invitation-primary" onClick={onCreate}>{hasActivePlan?'Schwerpunkte wählen':'Meinen Plan erstellen'}<ArrowRight size={20}/></button>
 <button className="w3-plan-invitation-later" onClick={onClose}>Später</button></dialog>
}
/** Feature invitation for existing riders; never writes or replaces a plan. */
export default function W3PlanInvitation(){
 const {user,isLoading}=useAuth(),location=useLocation(),nav=useNavigate()
 const eligible=!!user&&!isLoading&&ROUTES.has(location.pathname)&&!new URLSearchParams(location.search).has('choose')&&!new URLSearchParams(location.search).has('created')
 const plan=useQuery({queryKey:['plan','current'],queryFn:fetchCurrentPlan,enabled:eligible,staleTime:60_000,retry:false})
 const [openFor,setOpenFor]=useState<number|null>(null),attempted=useRef<number|null>(null)
 useEffect(()=>{
  if(!eligible||!user||!plan.data||plan.isError||attempted.current===user.id)return
  const id=user.id
  try{if(localStorage.getItem(seenKey(id))==='seen')return}catch{/* Browser storage is optional. */}
  const timer=window.setTimeout(()=>{
   attempted.current=id
   if(document.querySelector('dialog[open]')||!claimGate(GATE))return
   try{localStorage.setItem(seenKey(id),'seen')}catch{/* In-memory guard prevents repeats. */}
   setOpenFor(id)
  },2400)
  return()=>window.clearTimeout(timer)
 },[eligible,user?.id,plan.data,plan.isError])
 useEffect(()=>{if(!eligible||openFor!==user?.id){setOpenFor(null);releaseGate(GATE)}return()=>releaseGate(GATE)},[eligible,user?.id])
 const close=()=>{setOpenFor(null);releaseGate(GATE)}
 if(!eligible||openFor!==user?.id)return null
 return <PlanInvitationView hasActivePlan={plan.data?.status==='active'} onClose={close} onCreate={()=>{close();nav('/e/w3-plan?choose=1')}}/>
}

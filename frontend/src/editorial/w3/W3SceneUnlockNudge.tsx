import {useEffect, useRef, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {useQuery} from '@tanstack/react-query'
import {Gift, ArrowUpRight} from 'lucide-react'
import {useAuth} from '../../contexts/AuthContext'
import {fetchStageUpdates, fetchStageImage, type StageCard} from '../../api/stageGallery'
import {useSelectStage} from '../../hooks/useGarage'
import {useMyReferrals} from '../../hooks/useReferrals'
import {fetchMyReferrals} from '../../api/referral'
import {SceneCollectionView} from './W3SceneCollection'
import './w3scenes.css'
const seenKey=(userId:number,id:string)=>`ridr:scene-revealed:v1:${userId}:${id}`
function unseen(userId:number,scene:StageCard){try{return localStorage.getItem(seenKey(userId,scene.id))!=='seen'}catch{return true}}

export default function W3SceneUnlockNudge(){
 const {user}=useAuth()
 const location=useLocation()
 return user ? <RiderUnlock key={`${user.id}:${location.pathname}`} userId={user.id}/> : null
}
function RiderUnlock({userId}:{userId:number}){
 const location=useLocation(),navigate=useNavigate(),select=useSelectStage(),referrals=useMyReferrals()
 const enabled=['/e/w3-today','/e/w3-rides','/e/w3-wins','/e/w3-biker'].includes(location.pathname)
 const [opened,setOpened]=useState<StageCard|null>(null),[read,setRead]=useState<string[]>([])
 const [loading,setLoading]=useState(false),[failed,setFailed]=useState(false)
 const alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 // Metadata only: imagery is fetched once, when the rider chooses to reveal it.
 const query=useQuery({queryKey:['garage','gallery','updates',userId],queryFn:fetchStageUpdates,enabled,staleTime:30_000,refetchOnWindowFocus:true,refetchInterval:q=>q.state.data?.stages.some(s=>s.owned&&s.render_status==='pending')?15_000:60_000})
 if(!enabled)return null
 const next=query.data?.stages.find(s=>s.owned&&!s.starter&&s.plate_url&&s.activity_id!=null&&!read.includes(s.id)&&unseen(userId,s))
 const unavailable=failed||next?.render_status==='failed'||next?.render_status==='missing'
 const ready=next?.render_status==='ok'
 const reveal=async()=>{
  if(!next||loading)return
  if(unavailable){navigate('/e/w3-wins');return}
  if(!ready)return
  setLoading(true)
  try{
   const image=await fetchStageImage(next.id)
   if(!alive.current)return
   try{localStorage.setItem(seenKey(userId,next.id),'seen')}catch{/* Remember for this visit. */}
   setRead(v=>[...v,next.id]);setOpened({...next,image})
  }catch{if(alive.current)setFailed(true)}
  finally{if(alive.current)setLoading(false)}
 }
 const detail=loading?'Dein Bild wird geladen …':unavailable?'Deine Kulisse wartet in Erfolge':ready?'Für diese Fahrt. Für dein Bike.':'Dein Bild wird vorbereitet …'
 return <>{next&&<button className="w3-scene-live-nudge" onClick={reveal} disabled={loading||(!ready&&!unavailable)} aria-label={unavailable?'Neue Kulisse in Erfolge ansehen':ready?'Neue Kulisse enthüllen':'Neue Kulisse freigeschaltet, dein Bild wird vorbereitet'}><Gift size={22}/><span><strong>Neue Kulisse freigeschaltet</strong><span>{detail}</span></span>{(ready||unavailable)&&<ArrowUpRight size={20}/>}</button>}{opened&&<SceneCollectionView key={opened.id} data={{stages:[opened],owned_count:1,total_count:1}} bike={null} reveal revealOnly onSelect={id=>select.mutateAsync(id)} selecting={select.isPending} loadOriginal={fetchStageImage} referralCode={referrals.data?.code} loadReferralCode={async()=>(await fetchMyReferrals()).code}/>}</>
}

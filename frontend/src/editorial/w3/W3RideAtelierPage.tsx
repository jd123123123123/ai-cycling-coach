import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { fetchActivity } from '../../api/dashboard'
import { fetchRideChart } from '../../api/rideChart'
import { fetchTrainingReview } from '../../api/trainingReview'
import { fetchStreamAnalysis } from '../../api/streamAnalysis'
import { useRaceDebrief } from '../../hooks/useRaceDebrief'
import { RideAtelier, atelierTokens } from './W3RideAtelierView'
import { rideAtelierVm, rideAtelierReview } from './rideAtelierAdapter'
import W3RideStageRewards from './W3RideStageRewards'
import './w3.css'
import W3TopBar from './W3TopBar'

/** The ride opens from its small activity record; a slow coach never blocks it. */
export default function W3RideAtelierPage(){
 const {id}=useParams(),navigate=useNavigate(),rideId=Number(id),valid=Number.isSafeInteger(rideId)&&rideId>0
 const activity=useQuery({queryKey:['activity',rideId],queryFn:()=>fetchActivity(rideId),enabled:valid,staleTime:60_000,retry:1})
 const ready=valid&&!!activity.data
 const chart=useQuery({queryKey:['ride-chart',rideId],queryFn:()=>fetchRideChart(rideId),enabled:ready,staleTime:300_000,retry:1})
 const review=useQuery({queryKey:['training-review',rideId],queryFn:()=>fetchTrainingReview(rideId),enabled:ready,staleTime:30_000,retry:1})
 const streams=useQuery({queryKey:['stream-analysis',rideId],queryFn:()=>fetchStreamAnalysis(rideId),enabled:ready,staleTime:300_000,retry:1})
 const debrief=useRaceDebrief(ready?rideId:undefined)
 const back=()=>navigate('/e/w3-rides')
 const retry=()=>{void chart.refetch();void review.refetch();void streams.refetch();void debrief.refetch()}
 const failed=chart.isError||review.isError||streams.isError||debrief.isError
 const pending=chart.isFetching||review.isFetching||streams.isFetching||debrief.isFetching
 return <main className="atelier-preview atelier-live" style={atelierTokens()}>
  {activity.data?<RideAtelier key={rideId} vm={rideAtelierVm(activity.data,chart.data,debrief.data)} review={rideAtelierReview(activity.data,chart.data,review.data,review.isFetching)} rideDate={activity.data.started_at}
    samples={chart.data?.samples??[]} ftp={chart.data?.ftp_at_ride??null} hrMax={chart.data?.hr_max??null} ftpEntries={chart.data?.ftp_history??[]}
    contributions={chart.data?.contributions} coachData={{debrief:debrief.data??null,streams:streams.data??null,samples:chart.data?.samples??[],ftpAtRide:chart.data?.ftp_at_ride??null}}
    onBack={back} onExpandMap={activity.data.route_polyline?.length?()=>navigate(`/e/w3-ride-map/${rideId}`):undefined}
    detailsExtra={<>{pending?<p>Analyse wird ergänzt…</p>:failed?<button className="atelier-primary" onClick={retry}>Analyse erneut laden<RefreshCw size={17}/></button>:null}<W3RideStageRewards activityId={rideId}/></>}/>
  :<article className="atelier-device"><W3TopBar title="Fahrt" onBack={back} showAvatar={false}/><div className="atelier-load-state" role="status"><p>{activity.isPending&&valid?'Deine Fahrt wird geladen…':'Diese Fahrt ist nicht verfügbar.'}</p>{activity.isError&&<button className="atelier-primary" onClick={()=>{void activity.refetch()}}>Erneut versuchen<RefreshCw size={17}/></button>}</div></article>}
 </main>
}

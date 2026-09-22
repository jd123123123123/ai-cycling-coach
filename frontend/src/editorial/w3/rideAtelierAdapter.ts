import type { ActivityRead } from '../../api/dashboard'
import type { RideChart } from '../../api/rideChart'
import type { RaceDebrief } from '../../api/debrief'
import type { TrainingReview } from '../../api/trainingReview'
import type { RideAtelierVm } from './W3RideAtelierView'
import { elapsed, formatValue as f } from './atelierRideData'

export function rideAtelierVm(activity:ActivityRead,chart?:RideChart,debrief?:RaceDebrief):RideAtelierVm {
 const km=activity.distance_meters==null?null:activity.distance_meters/1000
 const seconds=activity.duration_seconds
 const efforts=chart?.efforts??[]
 return {title:activity.title||'Deine Fahrt',bigStat:f(km,1),bigStatUnit:'km',climb:activity.elevation_gain_m==null?'—':`${f(activity.elevation_gain_m)} hm`,avgSpeed:km!=null&&seconds?`${f(km/seconds*3600,1)} km/h`:'—',polyline:activity.route_polyline??null,
  hero:{dateLine:new Date(activity.started_at).toLocaleDateString('de-DE',{day:'numeric',month:'long',year:'numeric'}),duration:seconds==null?'—':`${elapsed(seconds)} h`},
  ranks:(efforts.length?efforts:(debrief?.efforts??[]).filter(e=>e.duration_s>=1&&e.duration_s<=1200).map(e=>({seconds:e.duration_s,watts:e.ride_watts,previous:e.best_watts}))).map(e=>{
   const delta=e.previous==null?null:e.watts-e.previous
   return {durationSeconds:e.seconds,dur:e.seconds<60?`${e.seconds} SEK`:`${e.seconds/60} MIN`,wattsValue:e.watts,bestWattsValue:e.previous,watts:`${f(e.watts)} W`,bestWatts:e.previous==null?null:`${f(e.previous)} W`,pr:delta!=null&&delta>0,fill:e.previous?Math.min(1,e.watts/e.previous):1,note:delta==null?'':`${delta>0?'+':''}${f(delta)} W`}
  })}
}
/** Missing comparison is explicit, while measured zones remain independently available. */
export function rideAtelierReview(activity:ActivityRead,chart:RideChart|undefined,review:TrainingReview|undefined,pending=false):TrainingReview {
 const labels=['Erholung','Ausdauer','Tempo','Schwelle','VO₂-Bereich','Anaerob','Sprint']
 const base:TrainingReview=review??{version:'recorded',activity_id:activity.id,headline:'Deine Fahrt',summary:pending?'Die gespeicherte Empfehlung wird geladen.':'Für diese Fahrt ist kein Planvergleich verfügbar.',score:null,score_label:'',status:'limited',planned_title:null,actual_title:activity.title??'Fahrt',coverage:null,stimulus:'',stimulus_detail:'',pairs:[{label:'Dauer',actual:activity.duration_seconds==null?null:activity.duration_seconds/60,planned:null,unit:'min'},{label:'Belastung',actual:activity.tss,planned:null,unit:'TSS'}],zones:[],trace:[],impact:[],impact_basis:null,changes:[],action:'',limitations:[],method:'Aufgezeichnete Messwerte. Keine ersetzten oder geschätzten Messungen.'}
 return {...base,zones:labels.map((label,i)=>({label,actual_seconds:chart?.zone_seconds[i]??base.zones[i]?.actual_seconds??null,planned_seconds:base.zones[i]?.planned_seconds??null}))}
}

import type {CrewTelemetrySample,CrewTelemetryZone} from '../../api/crewRides'
import {T} from './w3tokens'

// The same ordered palette as W3ZoneLadder, not a second chart theme.
export const TELEMETRY_ZONE_COLORS=[T.cool,T.training,T.acid,T.warn,T.bad,T.evening]
export const GRADE_BANDS=[
 {id:1,name:'Abfahrt',upper:-2,color:T.cool},
 {id:2,name:'Flach',upper:2,color:T.training},
 {id:3,name:'2–5 %',upper:5,color:T.acid},
 {id:4,name:'5–9 %',upper:9,color:T.warn},
 {id:5,name:'> 9 %',upper:null,color:T.bad},
]
export function telemetryZone(value:number|null|undefined,bands:CrewTelemetryZone[]){
 return value==null?null:bands.find(z=>z.upper==null||value<=z.upper)??null
}
export function distanceDomain(samples:CrewTelemetrySample[]){
 if(samples.length<2||samples.some((p,i)=>p.distance==null||!Number.isFinite(p.distance)||(i>0&&p.distance<samples[i-1].distance!)))return null
 const start=samples[0].distance!,end=samples.at(-1)!.distance!
 return end>start?{start,end}:null
}

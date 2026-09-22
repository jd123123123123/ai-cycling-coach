import { sessionBars } from './W3PlanFocus'
import { zoneOf, type DayPowerChart } from './planWorkoutComparison'
import type { IntervalBlockOut } from '../../api/weeks'

/** Deterministic design-only recordings; imported by the dev preview route. */
export function previewPrescription(day:number){
 const blocks:IntervalBlockOut[]=[]
 const add=(minutes:number,ratio:number)=>blocks.push({duration_seconds:minutes*60,power_target_pct_ftp:ratio,zone:zoneOf(ratio)+1})
 if(day===0){add(15,.5);for(let i=0;i<3;i++){add(12,.88);if(i<2)add(5,.45)}add(14,.5)}
 if(day===3){add(15,.5);for(let i=0;i<5;i++){add(3,1.15);if(i<4)add(3,.45)}add(18,.5)}
 if(day===5)add(150,.65)
 if(day===6)add(45,.5)
 return sessionBars(blocks,null,blocks.reduce((sum,b)=>sum+b.duration_seconds,0))
}
export function previewPower(day:number,duration:number):DayPowerChart{
 const bars=previewPrescription(day), zones=Array<number>(7).fill(0)
 const raw=Array.from({length:duration},(_,s)=>{
  let start=0,ratio=.65
  for(const b of bars){if(s<start+(b.seconds??0)){ratio=b.ftpRatio??.65;break}start+=b.seconds??0}
  const value=Math.max(0,ratio*(.93+.06*Math.sin(s/67))+.018*Math.sin(s/13)+(s%700<90?.12:0))
  zones[zoneOf(value)]++
  return value*240
 })
 const count=Math.min(360,duration)
 return {activity_id:-(day+1),ftp_at_ride:240,zone_seconds:zones,samples:Array.from({length:count},(_,i)=>{
  const a=Math.floor(i*duration/count),b=Math.floor((i+1)*duration/count)
  return {seconds:(a+b-1)/2,power:raw.slice(a,b).reduce((sum,p)=>sum+p,0)/(b-a),heart_rate:null,altitude:null,cadence:null,distance:null,grade:null,speed:null}
 })}
}

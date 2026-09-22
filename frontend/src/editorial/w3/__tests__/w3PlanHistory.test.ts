import {it,expect} from 'vitest'
import {recordedPlanDay} from '../w3PlanHistory'
import type {ActivityRead} from '../../../api/dashboard'
const ride=(tss:number|null,seconds:number|null)=>({sport:'cycling',started_at:new Date(2026,8,21,0,15).toISOString(),tss,duration_seconds:seconds}) as ActivityRead
it('uses the displayed local date and sums every ride',()=>{expect(recordedPlanDay([ride(20,1200),ride(40,2400)],'2026-09-21')).toMatchObject({ridden:true,actualTss:60,actualDuration:3600})})
it('retains recorded ride evidence when its TSS is unknown',()=>{expect(recordedPlanDay([ride(null,1200),ride(40,2400)],'2026-09-21')).toMatchObject({ridden:true,actualTss:null,actualDuration:3600})})
it('does not report a ride for an empty date',()=>{expect(recordedPlanDay([ride(20,1200)],'2026-09-20')).toMatchObject({ridden:false,actualTss:null,actualDuration:null})})
it('returns only the selected day’s cycling links for the history view',()=>{
 const activities=[{...ride(30,1800),id:12,title:'Abendrunde'},{...ride(40,2400),id:13,title:null},{...ride(10,600),id:14,sport:'running'}] as ActivityRead[]
 expect(recordedPlanDay(activities,'2026-09-21').actualRides).toEqual([{id:12,title:'Abendrunde'},{id:13,title:'Deine Fahrt'}])
})

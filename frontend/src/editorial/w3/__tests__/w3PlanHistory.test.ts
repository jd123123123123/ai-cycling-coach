import {it,expect} from 'vitest'
import {recordedPlanDay} from '../w3PlanHistory'
import type {ActivityRead} from '../../../api/dashboard'
const ride=(tss:number|null,seconds:number|null)=>({sport:'cycling',started_at:new Date(2026,8,21,0,15).toISOString(),tss,duration_seconds:seconds}) as ActivityRead
it('uses the displayed local date and sums every ride',()=>{expect(recordedPlanDay([ride(20,1200),ride(40,2400)],'2026-09-21')).toEqual({ridden:true,actualTss:60,actualDuration:3600})})
it('retains recorded ride evidence when its TSS is unknown',()=>{expect(recordedPlanDay([ride(null,1200),ride(40,2400)],'2026-09-21')).toEqual({ridden:true,actualTss:null,actualDuration:3600})})
it('does not report a ride for an empty date',()=>{expect(recordedPlanDay([ride(20,1200)],'2026-09-20')).toEqual({ridden:false,actualTss:null,actualDuration:null})})

import {expect,it} from 'vitest'
import {distanceDomain,telemetryZone,GRADE_BANDS} from '../w3RideTelemetryModel'
import type {CrewTelemetrySample} from '../../../api/crewRides'
it('assigns boundaries without gaps and never classifies absent measurements',()=>{
 const bands=[{id:1,name:'Z1',upper:132},{id:2,name:'Z2',upper:180},{id:3,name:'Z3',upper:null}]
 expect(telemetryZone(132,bands)?.id).toBe(1)
 expect(telemetryZone(132.1,bands)?.id).toBe(2)
 expect(telemetryZone(null,bands)).toBeNull()
 expect(telemetryZone(-4,GRADE_BANDS)?.name).toBe('Abfahrt')
 expect(telemetryZone(10,GRADE_BANDS)?.name).toBe('> 9 %')
})
it('uses distance only when the entire axis is finite and monotonic',()=>{
 const make=(ds:(number|null)[])=>ds.map((distance,i)=>({position:i/(ds.length-1),distance} as CrewTelemetrySample))
 expect(distanceDomain(make([0,100,350]))).toEqual({start:0,end:350})
 expect(distanceDomain(make([0,null,350]))).toBeNull()
 expect(distanceDomain(make([0,100,20]))).toBeNull()
 expect(distanceDomain(make([0,0,0]))).toBeNull()
})

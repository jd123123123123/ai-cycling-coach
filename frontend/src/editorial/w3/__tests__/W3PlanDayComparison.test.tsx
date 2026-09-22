// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, expect, it} from 'vitest'
import W3PlanDayComparison, {tssDifference, rideTime} from '../W3PlanDayComparison'
import {plannedPower, recordedPower, zoneTime} from '../planWorkoutComparison'
import {sessionBars} from '../W3PlanFocus'
import {previewPower,previewPrescription} from '../planPowerPreview'
import type {PlanDaySession} from '../W3PlanView'
afterEach(cleanup)
const day:PlanDaySession={title:'Sweetspot',weekday:'Mo',dateLabel:'24. Aug.',isToday:false,isPast:true,dur:'1:15 h',plannedDuration:4500,tss:'66',targetW:'216 W',ftpPct:'90%',bars:previewPrescription(0),actualKnown:true,ridden:true,actualTss:48,actualDuration:2640,powerCharts:[previewPower(0,2640)]}
it('compares the shorter recording on the prescription time axis and opens zones',()=>{
 render(<W3PlanDayComparison day={day}/>);
 expect(screen.getByText('1:15 h')).toBeTruthy();expect(screen.getByText('44 min')).toBeTruthy()
 expect(screen.getByRole('slider',{name:'Zeit im Trainingsprofil'}).getAttribute('max')).toBe('4499')
 fireEvent.click(screen.getByRole('button',{name:'Zonen'}));
 expect(screen.getByRole('button',{name:/Z3 Tempo: Ist.*Soll 36′/})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:/TSS: Ist 48, Soll 66/}));expect(screen.getByText('−18 TSS zum Plan')).toBeTruthy()
})
it('distinguishes missing TSS, unavailable ride data, and no ride',()=>{
 const {rerender}=render(<W3PlanDayComparison day={{...day,actualTss:null}}/>);
 expect(screen.getByText('TSS nicht erfasst')).toBeTruthy()
 rerender(<W3PlanDayComparison day={{...day,actualKnown:false,actualTss:null,actualDuration:null,ridden:false,powerCharts:[]}}/>);
 expect(screen.getByText('Daten fehlen')).toBeTruthy()
 rerender(<W3PlanDayComparison day={{...day,actualKnown:true,actualTss:null,actualDuration:null,ridden:false,powerCharts:[]}}/>);
 expect(screen.getByText('Keine Fahrt aufgezeichnet')).toBeTruthy()
})
it('keeps rest-day recommendations at zero without dividing by zero',()=>{
 render(<W3PlanDayComparison day={{...day,title:null,bars:[],dur:null,plannedDuration:0,tss:'—',actualTss:25}}/>);
 fireEvent.click(screen.getByRole('button',{name:/TSS: Ist 25, Soll 0/}));expect(screen.getByText('+25 TSS zum Plan')).toBeTruthy()
})
it('keeps equal load neutral and unknown values missing',()=>{
 expect(tssDifference(70,70)).toBe('Belastung wie geplant')
 expect(tssDifference(70,80.4)).toBe('+10 TSS zum Plan')
 expect(tssDifference(70,null)).toBeNull();expect(tssDifference(70,NaN)).toBeNull()
 expect(rideTime(3599)).toBe('1:00 h');expect(zoneTime(null)).toBe('—');expect(zoneTime(20)).toBe('20″')
})
it('does not infer precise zones from intensity factor, partial intervals or missing duration',()=>{
 expect(plannedPower({...day,bars:sessionBars([],.8,4500)}).zones).toBeNull()
 expect(plannedPower({...day,bars:[{w:.5,work:true}]}).zones).toBeNull()
 expect(plannedPower({...day,bars:previewPrescription(0),plannedDuration:5000}).zones).toBeNull()
 const blocks=sessionBars([{duration_seconds:60,power_target_pct_ftp:null,zone:2},{duration_seconds:120,power_target_pct_ftp:.7,zone:2}],null,180)
 const partial=plannedPower({...day,bars:blocks,plannedDuration:180})
 expect(partial.beams[1].start).toBe(60);expect(partial.zones).toBeNull()
})
it('preserves full-resolution zone totals and never calculates them from averaged beams',()=>{
 const chart=previewPower(0,2640), totals=[21,34,55,89,13,8,5]
 const recorded=recordedPower([{...chart,zone_seconds:totals}])
 expect(recorded.zones).toEqual(totals)
 expect(recorded.duration).toBeCloseTo(2640,0)
 expect(recorded.duration).toBeLessThan(plannedPower(day).duration)
 expect(recordedPower([{...chart,ftp_at_ride:null}]).beams.every(b=>b.ratio==null)).toBe(true)
 expect(recordedPower([{...chart,zone_seconds:[null,null,null,null,null,null,null]}]).zones).toBeNull()
 expect(recordedPower([chart],false).zones).toBeNull()
})
it('keeps endurance as one prescribed beam, and adds separate ride boundaries',()=>{
 const plan=plannedPower({...day,bars:previewPrescription(5),plannedDuration:9000})
 expect(plan.beams).toHaveLength(1);expect(plan.zones?.[1]).toBe(9000)
 const two=recordedPower([previewPower(0,2640),previewPower(6,600)])
 expect(two.boundaries).toEqual([2640]);expect(two.duration).toBe(3240)
})

it('preserves elapsed gaps for rides without samples; hides ambiguous combined timelines',()=>{
 const ride=previewPower(6,600), missing={...ride,samples:[],elapsed_seconds:900}
 const first=recordedPower([missing,ride]);expect(first.duration).toBe(1500);expect(first.boundaries).toEqual([900]);expect(first.beams[0]).toEqual({start:0,end:900,ratio:null});expect(first.beams[1].start).toBe(900)
 const middle=recordedPower([ride,missing,ride]);expect(middle.boundaries).toEqual([600,1500]);expect(middle.duration).toBe(2100);expect(middle.zones).toBeNull();expect(middle.partial).toBe(true)
 const unknown=recordedPower([{...missing,elapsed_seconds:undefined},ride]);expect(unknown.beams).toEqual([]);expect(unknown.boundaries).toEqual([]);expect(unknown.partial).toBe(true)
})

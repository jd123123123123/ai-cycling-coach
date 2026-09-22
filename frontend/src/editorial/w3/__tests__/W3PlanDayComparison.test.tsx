// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, expect, it} from 'vitest'
import W3PlanDayComparison, {tssDifference, rideTime, comparisonPositions} from '../W3PlanDayComparison'
import type {PlanDaySession} from '../W3PlanView'
afterEach(cleanup)
const day:PlanDaySession={title:'Sweetspot',weekday:'Mo',dateLabel:'24. Aug.',isToday:false,isPast:true,dur:'1:15 h',plannedDuration:4500,tss:'66',targetW:'216 W',ftpPct:'90%',bars:[],actualKnown:true,ridden:true,actualTss:48,actualDuration:2640}
it('shows recommended and recorded load, time and a signed difference together',()=>{
 render(<W3PlanDayComparison day={day}/>);
 expect(screen.getByText('Ist')).toBeTruthy();expect(screen.getByText('Soll')).toBeTruthy()
 expect(screen.getByText('1:15 h')).toBeTruthy();expect(screen.getByText('44 min')).toBeTruthy()
 expect(screen.queryByText('−18 TSS')).toBeNull();fireEvent.click(screen.getByRole('button',{name:/TSS: Ist 48, Soll 66/}));expect(screen.getByText('−18 TSS')).toBeTruthy()
})
it('does not turn missing TSS into zero or an adherence percentage',()=>{
 render(<W3PlanDayComparison day={{...day,actualTss:null}}/>);
 expect(screen.getByText('TSS nicht erfasst')).toBeTruthy()
 expect(screen.queryByText(/%/)).toBeNull()
})
it('separates unavailable ride data from a day with no recorded ride',()=>{
 const {rerender}=render(<W3PlanDayComparison day={{...day,actualKnown:false,actualTss:null,actualDuration:null,ridden:false}}/>);
 expect(screen.getByText('Daten fehlen')).toBeTruthy()
 rerender(<W3PlanDayComparison day={{...day,actualKnown:true,actualTss:null,actualDuration:null,ridden:false}}/>);
 expect(screen.getByText('Keine Fahrt aufgezeichnet')).toBeTruthy()
})
it('compares an unplanned ride with a rest day without division by zero',()=>{
 render(<W3PlanDayComparison day={{...day,title:null,dur:null,tss:'—',actualTss:25}}/>);
 fireEvent.click(screen.getByRole('button',{name:/TSS: Ist 25, Soll 0/}));expect(screen.getByText('+25 TSS')).toBeTruthy()
})
it('keeps equal load neutral and handles unknown or fractional values',()=>{
 expect(tssDifference(70,70)).toBe('Belastung wie geplant')
 expect(tssDifference(70,80.4)).toBe('+10 TSS zum Plan')
 expect(tssDifference(70,null)).toBeNull();expect(tssDifference(70,NaN)).toBeNull()
 expect(rideTime(3599)).toBe('1:00 h');expect(rideTime(null)).toBe('—')
})

it('plots actual and planned on a shared zero-based scale, including over-target effort',()=>{
 expect(comparisonPositions(100,50)).toEqual({planned:294,actual:180})
 expect(comparisonPositions(50,100)).toEqual({planned:180,actual:294})
 expect(comparisonPositions(0,0)).toEqual({planned:66,actual:66})
 expect(comparisonPositions(null,20)).toEqual({planned:null,actual:294})
 expect(comparisonPositions(20,NaN).actual).toBeNull()
 expect(comparisonPositions(20,-1).actual).toBeNull()
})
it('does not invent a planned duration from a formatted label',()=>{
 render(<W3PlanDayComparison day={{...day,plannedDuration:null}}/>);
 expect(screen.getByRole('img',{name:'Zeit: Ist 44 min, Soll —'})).toBeTruthy()
})

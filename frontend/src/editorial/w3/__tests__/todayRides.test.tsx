import {afterEach,expect,it} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import type {CrewRide} from '../../../api/crewRides'
import {otherCrewRides,W3TodayRidesSummaryView} from '../W3TodayRides'
afterEach(cleanup)
const ride=(over:Partial<CrewRide>={}):CrewRide=>({id:1,user_id:1,handle:'mara',display_name:'Mara',title:'Küstenrunde',started_at:'2026-09-10T09:00:00Z',distance_m:82400,elevation_gain_m:640,duration_seconds:11040,sport:'cycling',tss:null,avg_power_w:null,avg_hr:null,calories:null,is_mine:false,reactions:{counts:{},mine:[]},comment_count:0,description:null,photo_urls:[],elevation_profile:null,power_profile:null,record:null,context:null,...over})
it('separates other riders from personal rides and sorts recent rides first without altering input',()=>{
 const input=[ride({id:2,started_at:'2026-09-09T09:00:00Z'}),ride({id:3,is_mine:true}),ride()]
 expect(otherCrewRides(input).map(r=>r.id)).toEqual([1,2])
 expect(input.map(r=>r.id)).toEqual([2,3,1])
})
it('opens the selected other rider activity and does not invent a profile',()=>{
 const selected:number[]=[]
 render(<W3TodayRidesSummaryView rides={[ride(),ride({id:2,is_mine:true,title:'Meine Fahrt'})]} onOpenRide={id=>selected.push(id)}/>)
 expect(screen.queryByText('Meine Fahrt')).toBeNull()
 expect(screen.queryByRole('img')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:/Mara.*Fahrt öffnen/}))
 expect(selected).toEqual([1])
})
it('keeps missing feed, failed feed, and measured profiles distinct',()=>{
 const {rerender}=render(<W3TodayRidesSummaryView rides={[]} error onOpenRide={()=>{}}/>)
 expect(screen.getByText('Fahrten gerade nicht verfügbar.')).toBeTruthy()
 rerender(<W3TodayRidesSummaryView rides={[ride({elevation_profile:[100,120,180,130]})]} onOpenRide={()=>{}}/>)
 expect(screen.getByRole('img',{name:'Höhenprofil dieser Fahrt'})).toBeTruthy()
})

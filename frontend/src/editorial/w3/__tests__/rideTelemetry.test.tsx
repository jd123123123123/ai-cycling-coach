import {afterEach,expect,it} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {W3RideTelemetryView} from '../W3RideTelemetryPanel'
import type {CrewRide,CrewRideTelemetry} from '../../../api/crewRides'
afterEach(cleanup)
const ride={id:7,display_name:'Mara',title:'Küstenrunde',avg_power_w:185,avg_hr:132} as CrewRide
const data:CrewRideTelemetry={activity_id:7,samples:[{position:0,power:150,heart_rate:120,altitude:20,cadence:null},{position:.5,power:null,heart_rate:140,altitude:60,cadence:null},{position:1,power:210,heart_rate:136,altitude:20,cadence:null}]}
it('switches true power and HR series and retains the recorded average',()=>{
 render(<W3RideTelemetryView ride={ride} data={data} onClose={()=>{}}/>)
 expect(screen.getByText('185')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Puls'}))
 expect(screen.getByText('132')).toBeTruthy()
 expect(screen.getByRole('img',{name:'Pulsverlauf der Fahrt'})).toBeTruthy()
 fireEvent.change(screen.getByRole('slider'),{target:{value:'1'}})
 expect(screen.getByText('140',{selector:'strong'})).toBeTruthy()
 expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('50 Prozent, 140 bpm')
 fireEvent.click(screen.getByRole('button',{name:'Zurück zu Ø'}))
 expect(screen.getByText('132',{selector:'strong'})).toBeTruthy()
})
it('does not draw an absent channel or another rides telemetry',()=>{
 const {rerender}=render(<W3RideTelemetryView ride={ride} data={data} onClose={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'Trittfrequenz'}))
 expect(screen.queryByRole('img')).toBeNull()
 expect(screen.queryByRole('slider')).toBeNull()
 rerender(<W3RideTelemetryView ride={ride} data={{...data,activity_id:99}} onClose={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'Leistung'}))
 expect(screen.queryByRole('img')).toBeNull()
})

it('uses supplied rider zones, filters their ranges, and clears the filter on metric change',()=>{
 const zones={power:{basis:'ftp_history' as const,reference:240,bands:[{id:1,name:'Erholung',upper:132},{id:2,name:'Grundlage',upper:180},{id:3,name:'Tempo',upper:null}]}}
 render(<W3RideTelemetryView ride={ride} data={{...data,zones}} onClose={()=>{}}/>)
 expect(screen.queryByText('FTP zur Fahrt · 240 W')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Über diese Daten'}))
 expect(screen.getByText('FTP zur Fahrt · 240 W')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Über diese Daten'}))
 const zone=screen.getByRole('button',{name:'Zone 2: Grundlage'})
 fireEvent.click(zone)
 expect(zone.getAttribute('aria-pressed')).toBe('true')
 expect(screen.getByText('Z2 · Grundlage · >132–180 W')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Puls'}))
 expect(screen.queryByRole('button',{name:'Zone 2: Grundlage'})).toBeNull()
 expect(screen.getByText('Pulszonen fehlen')).toBeTruthy()
})

it('shows measured section grade and distance on the elevation profile',()=>{
 render(<W3RideTelemetryView ride={ride} data={{...data,samples:data.samples.map((p,i)=>({...p,distance:i*1000,grade_pct:i===1?4:-2}))}} onClose={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'Höhe'}))
 expect(screen.getByRole('button',{name:'5–9 %'})).toBeTruthy()
 fireEvent.change(screen.getByRole('slider'),{target:{value:'1'}})
 expect(screen.getByText('+4 %')).toBeTruthy()
 expect(screen.getByRole('img',{name:'Höhenverlauf der Fahrt'})).toBeTruthy()
})

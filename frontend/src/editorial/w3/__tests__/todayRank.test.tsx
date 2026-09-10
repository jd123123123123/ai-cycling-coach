import {afterEach,expect,it} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {W3TodayRankView} from '../W3TodayRank'
import type {StandingRow} from '../../../api/crew'
afterEach(cleanup)
const rows:StandingRow[]=[{user_id:2,handle:'Luca',is_you:false,weekly_score:200,weekly_tss:120,distance_km:80,daily_pct:[100,100,0,0,0,0,0]},{user_id:1,handle:'Jannis',is_you:true,weekly_score:200,weekly_tss:90,distance_km:60,weekly_target_tss:200,daily_target_tss:29,daily_pct:[0,100,100,0,0,0,0]}]
const view=(props:Partial<Parameters<typeof W3TodayRankView>[0]>={})=>render(<MemoryRouter><W3TodayRankView crewName="Nordrunde" rows={rows} {...props}/></MemoryRouter>)
it('shows the people and rank without default coaching paragraphs',()=>{
 view()
 expect(screen.getByText('Nordrunde')).toBeTruthy()
 expect(screen.getByText('140')).toBeTruthy()
 expect(screen.queryByText(/100 Punkte entsprechen/)).toBeNull()
 expect(screen.queryByRole('img',{name:/Tagespunkte/})).toBeNull()
 expect(screen.getByRole('button',{name:/Du, Platz 1, 200 Punkte/})).toBeTruthy()
 expect(screen.getByRole('button',{name:/Luca, Platz 1, 200 Punkte/})).toBeTruthy()
})
it('reveals the selected persons actual week and the scoring explanation independently',()=>{
 view()
 fireEvent.click(screen.getByRole('button',{name:/Du, Platz/}))
 expect(screen.getByRole('img',{name:/Tagespunkte: Mo 0, Di 100/})).toBeTruthy()
 expect(screen.getByText('90')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Punktewertung erklären'}))
 expect(screen.getByText(/100 Punkte entsprechen/)).toBeTruthy()
 expect(screen.getByText(/Dein Wochenziel: 200 TSS/)).toBeTruthy()
})
it('does not invent a crew distance when a members distance is missing',()=>{
 view({rows:[rows[0],{...rows[1],distance_km:null}]})
 expect(screen.queryByText('gemeinsam')).toBeNull()
})
it('distinguishes loading, unavailable, and no crew states',()=>{
 const {unmount}=view({pending:true,rows:[]})
 expect(screen.getByRole('status')).toBeTruthy();unmount()
 view({rows:[],crewName:null})
 expect(screen.getByRole('button',{name:/Crew finden/})).toBeTruthy()
})

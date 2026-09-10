import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { W3TodayGoalsSummary, W3TodayGoalsView, type TodayGoal } from '../W3TodayGoals'
afterEach(cleanup)
function setup(personal:unknown[]=[],crew:unknown[]=[]){
 const qc=new QueryClient({defaultOptions:{queries:{enabled:false}}})
 qc.setQueryData(['challenges','mine'],{active:personal})
 qc.setQueryData(['challenges','crew'],crew)
 qc.setQueryData(['athlete','me'],{user_id:2})
 return render(<QueryClientProvider client={qc}><W3TodayGoalsSummary/></QueryClientProvider>)
}
it('keeps personal and crew targets distinct and shows only this riders crew progress',()=>{
 setup([{key:'a',title:'Mein Distanzziel',metric:'distance_km',value:400,target:1200,pct:33.3}], [{id:1,name:'Crew-Ziel',metric:'distance_km',target:1000,participants:[{user_id:1,value:800,pct:80},{user_id:2,value:300,pct:30}]}])
 expect(screen.getByText('Mein Distanzziel')).toBeTruthy()
 expect(screen.getByText('Crew-Ziel')).toBeTruthy()
 expect(screen.getByText('300')).toBeTruthy()
 expect(screen.queryByText('800')).toBeNull()
})
it('never assigns another members contribution or zero to a missing member',()=>{
 setup([],[{id:1,name:'Crew-Ziel',metric:'distance_km',target:12000,participants:[{user_id:1,value:9000,pct:75}]}])
 expect(screen.getByText('—')).toBeTruthy()
 expect(screen.queryByText('9.000')).toBeNull()
})
it('keeps the no-goal state actionable without inventing targets',()=>{
 setup()
 expect(screen.getByText('Dein nächstes Ziel setzen')).toBeTruthy()
 expect(screen.queryByText('0%')).toBeNull()
})

const sample:TodayGoal={id:'personal:dist',personalKey:'dist',title:'Distanzziel',value:486,target:1200,unit:'km',scope:'Du',period:'September 2026',reward:240}
it('shows real remaining progress and scrubs actual day contributions',()=>{
 render(<W3TodayGoalsView items={[sample]} onSelect={()=>{}} onManage={()=>{}} series={{key:'dist',period:'2026-09',days:[42,0,64]}}/>)
 expect(screen.getByText('Noch 714 km')).toBeTruthy()
 fireEvent.change(screen.getByRole('slider',{name:'Tag des Zielbeitrags auswählen'}),{target:{value:'0'}})
 expect(screen.getByText(/42 km/)).toBeTruthy()
 expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toContain('42 km')
})
it('never reuses another goal daily series and keeps management available',()=>{
 const calls:string[]=[]
 render(<W3TodayGoalsView items={[sample]} onSelect={()=>{}} onManage={scope=>calls.push(scope)} series={{key:'different',period:'2026-09',days:[500]}}/>)
 expect(screen.queryByRole('slider')).toBeNull()
 expect(screen.getByText('Noch kein Tagesverlauf verfügbar.')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Ziel verwalten'}))
 fireEvent.click(screen.getByRole('button',{name:'Crew-Ziel'}))
 expect(calls).toEqual(['Du','Crew'])
})
it('selects crew goals without treating member scores as a combined target',()=>{
 const selected:string[]=[]
 const crew:TodayGoal={id:'crew:1',title:'Crew-Woche',value:128,target:200,unit:'km',scope:'Crew',period:'Diese Woche',members:[{id:2,handle:'@Jannis',value:128},{id:3,handle:'@Mara',value:172}]}
 const {rerender}=render(<W3TodayGoalsView items={[sample,crew]} onSelect={id=>selected.push(id)} onManage={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'Crew-Woche Crew'}))
 expect(selected).toEqual(['crew:1'])
 rerender(<W3TodayGoalsView items={[sample,crew]} selectedId="crew:1" onSelect={()=>{}} onManage={()=>{}}/>)
 expect(screen.getByText('Noch 72 km')).toBeTruthy()
 expect(screen.getByLabelText('Crew-Fortschritt je Mitglied')).toBeTruthy()
})

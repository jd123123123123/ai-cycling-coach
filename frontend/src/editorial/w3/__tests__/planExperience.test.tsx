import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,describe,it,expect,vi} from 'vitest'
import W3PlanExperience from '../W3PlanExperience'
import {beforeVm} from '../../../review-plan/data'
vi.mock('../W3TopBar',()=>({default:()=>null}))
vi.mock('../W3TabBar',()=>({default:()=>null}))
vi.mock('../W3PlanIntro',()=>({default:()=>null}))
vi.mock('../../../hooks/usePlanAdaptations',()=>({usePlanAdaptations:()=>({data:{adaptations:[]}})}))
vi.mock('../W3ProgressAnalytics',()=>({useProgressExplorer:()=>({isPending:false,isError:false}),W3ProgressAnalyticsView:()=>null}))
afterEach(cleanup)
const first={title:'Schwelle',weekday:'Montag',dateLabel:'14. Sept.',dateISO:'2026-09-14',isToday:true,isPast:false,dur:'60 min',tss:'65',targetW:'240 W',ftpPct:'100%',bars:[{w:.8,work:true}]}
function mount(state:'empty'|'active'|'created'|'ended'='active'){
 const onOpenSession=vi.fn(),onWeekOffset=vi.fn(),onCreatedDone=vi.fn()
 render(<MemoryRouter><W3PlanExperience vm={{...beforeVm,daySessions:[first,{...first,title:'Grundlage',isToday:false,dateISO:'2026-09-15',weekday:'Dienstag',dateLabel:'15. Sept.'}]}} state={state} onOpenSession={onOpenSession} onWeekOffset={onWeekOffset} onCreatedDone={onCreatedDone} weekOffset={0} onRebuild={async()=>true}/></MemoryRouter>)
 return {onOpenSession,onWeekOffset,onCreatedDone}
}
describe('live plan experience',()=>{
 it('opens the selected real workout date',()=>{const {onOpenSession}=mount();fireEvent.click(screen.getByRole('button',{name:'Dienstag 15. Sept.: Grundlage'}));fireEvent.click(screen.getByRole('button',{name:'Einheit ansehen'}));expect(onOpenSession).toHaveBeenCalledWith('2026-09-15')})
 it('uses a week offset, never rewrites the plan when browsing',()=>{const {onWeekOffset}=mount();fireEvent.click(screen.getByRole('button',{name:'Nächste Woche'}));expect(onWeekOffset).toHaveBeenCalledWith(1)})
 it('does not show a made-up adaptation',()=>{mount();expect(screen.queryByText('Dein Plan hat sich angepasst.')).toBeNull()})
 it('has an actionable empty state without training values',()=>{mount('empty');expect(screen.getByRole('button',{name:'Meinen Plan erstellen'})).toBeTruthy();expect(screen.queryByText('240 W')).toBeNull()})
 it('confirms a saved plan without claiming an unsaved draft',()=>{const {onCreatedDone}=mount('created');fireEvent.click(screen.getByRole('button',{name:'Zum ersten Training'}));expect(onCreatedDone).toHaveBeenCalledOnce()})
 it('shows a complete plan handoff before the first workout',()=>{mount('created');expect(screen.getByText('Dein Weg auf einen Blick')).toBeTruthy();expect(screen.getByText('Start → jetzt')).toBeTruthy();expect(screen.getByText('Dein aktueller Block')).toBeTruthy();expect(screen.getByText('Deine erste Woche')).toBeTruthy();expect(screen.queryByText('DEIN LETZTER PLAN')).toBeNull()})
 it('puts the current block before the workout in the active view',()=>{mount('active');const block=screen.getByText('Dein aktueller Block');const workout=screen.getByRole('heading',{name:'Schwelle'});expect(block.compareDocumentPosition(workout)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()})
 it('lets the rider change hours, days and the long-ride day',async()=>{
  const onRebuild=vi.fn().mockResolvedValue(true)
  render(<MemoryRouter><W3PlanExperience vm={{...beforeVm,daySessions:[first]}} state="active" onOpenSession={()=>{}} onCreatedDone={()=>{}} weekOffset={0} onWeekOffset={()=>{}} onRebuild={onRebuild}/></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:'Zeit und Trainingstage anpassen'}))
  fireEvent.change(screen.getByRole('slider',{name:'Stunden pro Woche'}),{target:{value:'7.5'}})
  fireEvent.click(screen.getByRole('button',{name:'Donnerstag aktiv'}))
  fireEvent.click(screen.getByRole('button',{name:'Mittwoch inaktiv'}))
  fireEvent.click(screen.getByRole('button',{name:'MI'}))
  fireEvent.click(screen.getByRole('button',{name:'Plan neu berechnen'}))
  await waitFor(()=>expect(onRebuild).toHaveBeenCalledWith({weekly_hours:7.5,days:[true,false,true,false,false,true,true],longDay:2}))
 })
 it('lets a finished rider select a new goal',()=>{mount('ended');expect(screen.getByRole('button',{name:'Nächstes Ziel wählen'})).toBeTruthy()})
})

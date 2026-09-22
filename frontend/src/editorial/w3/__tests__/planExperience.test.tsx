import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {afterEach, beforeEach,describe,it,expect,vi} from 'vitest'
import W3PlanExperience from '../W3PlanExperience'
import {beforeVm} from '../../../review-plan/data'
vi.mock('../W3TopBar',()=>({default:()=>null}))
vi.mock('../W3TabBar',()=>({default:()=>null}))
vi.mock('../W3PlanIntro',()=>({default:()=>null}))
vi.mock('../../../hooks/usePlanAdaptations',()=>({usePlanAdaptations:()=>({data:{adaptations:[]}})}))
vi.mock('../W3ProgressAnalytics',()=>({useProgressExplorer:()=>({isPending:false,isError:false}),W3ProgressAnalyticsView:()=>null}))
beforeEach(()=>{HTMLElement.prototype.scrollTo=vi.fn()})
afterEach(cleanup)
const first={title:'Schwelle',weekday:'Montag',dateLabel:'14. Sept.',dateISO:'2026-09-14',isToday:true,isPast:false,dur:'60 min',tss:'65',targetW:'240 W',ftpPct:'100%',bars:[{w:.8,work:true}]}
function mount(state:'empty'|'active'|'created'|'ended'='active'){
 const onOpenSession=vi.fn(),onWeekOffset=vi.fn(),onCreatedDone=vi.fn()
 const onRebuild=vi.fn(async()=>true)
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{enabled:false},mutations:{retry:false}}})}><MemoryRouter><W3PlanExperience vm={{...beforeVm,daySessions:[first,{...first,title:'Grundlage',isToday:false,dateISO:'2026-09-15',weekday:'Dienstag',dateLabel:'15. Sept.'}]}} state={state} onOpenSession={onOpenSession} onWeekOffset={onWeekOffset} onCreatedDone={onCreatedDone} weekOffset={0} onRebuild={onRebuild}/></MemoryRouter></QueryClientProvider>)
 return {onOpenSession,onWeekOffset,onCreatedDone,onRebuild}
}
describe('live plan experience',()=>{
 it('opens the selected real workout date',()=>{const {onOpenSession}=mount();// Die Tafel nennt seit dem Bogen auch ihre Last, also passt der Name nicht
 // mehr woertlich. Die ZUSICHERUNG ist unveraendert: der gewaehlte Tag ist als
 // Schaltflaeche erreichbar UND benannt.
 fireEvent.click(screen.getByRole('button',{name:/Dienstag, 15\. Sept\., Grundlage/}));fireEvent.click(screen.getByRole('button',{name:'Einheit ansehen'}));expect(onOpenSession).toHaveBeenCalledWith('2026-09-15')})
 it('uses a week offset, never rewrites the plan when browsing',()=>{
  // AUS ZWEI KNOEPFEN WURDE EIN SCHIEBER. Der Bogen traegt role="slider" mit
  // Pfeiltastensteuerung -- die Zusicherung ist dieselbe und bleibt die
  // wichtigere: Blaettern meldet einen OFFSET und schreibt den Plan nicht um.
  const {onWeekOffset,onRebuild}=mount()
  fireEvent.click(screen.getByRole('button',{name:/Woche 6:/}))
  expect(onWeekOffset).toHaveBeenCalledWith(1)
  expect(onRebuild).not.toHaveBeenCalled()
 })
 it('does not show a made-up adaptation',()=>{mount();expect(screen.queryByText('Dein Plan hat sich angepasst.')).toBeNull()})
 it('has an actionable empty state without training values',()=>{mount('empty');expect(screen.getByRole('button',{name:'Meinen Plan erstellen'})).toBeTruthy();expect(screen.queryByText('240 W')).toBeNull()})
 it('confirms a saved plan without claiming an unsaved draft',()=>{const {onCreatedDone}=mount('created');fireEvent.click(screen.getByRole('button',{name:'Zum ersten Training'}));expect(onCreatedDone).toHaveBeenCalledOnce()})
 it('shows a complete plan handoff before the first workout',()=>{mount('created');expect(screen.getByText('Dein Weg auf einen Blick')).toBeTruthy();expect(screen.getByText('Start → jetzt')).toBeTruthy();expect(screen.getByText('Dein aktueller Block')).toBeTruthy();expect(screen.getByText('Deine erste Woche')).toBeTruthy();expect(screen.queryByText('DEIN LETZTER PLAN')).toBeNull()})
 it('puts the current block before the workout in the active view',()=>{
  // Im aktiven Zustand steht statt der Blockzeile jetzt der Bogen -- er sagt
  // dasselbe (wo im Plan stehe ich) und zeigt es, statt es zu benennen. Die
  // ZUSICHERUNG ist die Reihenfolge: erst der Ort im Plan, dann die Einheit.
  mount('active')
  const ort=screen.getByRole('group',{name:'Trainingswoche wählen'})
  // Die Ueberschrift der Einheit nennt jetzt auch Leistung und Last.
  const workout=screen.getByRole('heading',{name:'Schwelle'})
  expect(ort.compareDocumentPosition(workout)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 })
 it('lets the rider change hours, days and the long-ride day',async()=>{
  const onRebuild=vi.fn().mockResolvedValue(true)
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{enabled:false},mutations:{retry:false}}})}><MemoryRouter><W3PlanExperience vm={{...beforeVm,daySessions:[first]}} state="active" onOpenSession={()=>{}} onCreatedDone={()=>{}} weekOffset={0} onWeekOffset={()=>{}} onRebuild={onRebuild}/></MemoryRouter></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button',{name:'Zeit und Trainingstage anpassen'}))
  fireEvent.change(screen.getByRole('slider',{name:'Stunden pro Woche'}),{target:{value:'7.5'}})
  fireEvent.click(screen.getByRole('button',{name:'Donnerstag aktiv'}))
  fireEvent.click(screen.getByRole('button',{name:'Mittwoch inaktiv'}))
  fireEvent.click(screen.getByRole('button',{name:'MI'}))
  fireEvent.click(screen.getByRole('button',{name:'Plan neu berechnen'}))
  await waitFor(()=>expect(onRebuild).toHaveBeenCalledWith({weekly_hours:7.5,days:[true,false,true,false,false,true,true],longDay:2,longDays:[2,5]}))
 })
 it('lets a finished rider select a new goal',()=>{mount('ended');expect(screen.getByRole('button',{name:'Nächstes Ziel wählen'})).toBeTruthy()})
})

import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,beforeAll,describe,it,expect,vi} from 'vitest'
import Composer,{makeGoalInput} from '../W3PlanGoalComposer'
import {EMPTY_BRIEF} from '../w3PlanGoalTypes'
import {previewPlanGoal,applyPlanGoal} from '../../../api/planGoal'
vi.mock('../../../api/planGoal',()=>({previewPlanGoal:vi.fn(),applyPlanGoal:vi.fn()}))
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","")};HTMLDialogElement.prototype.close=vi.fn()})
afterEach(()=>{cleanup();vi.clearAllMocks()})
describe('saved plan intake',()=>{
 it('sends course values and exact availability',()=>{expect(makeGoalInput({...EMPTY_BRIEF,date:'2027-06-01',duration:'6',distance:'160',elevation:'2000',intent:'faster'},'auto',8,[true,false,true,false,true,false,true])).toEqual({focus:'auto',target_date:'2027-06-01',duration_hours:6,distance_km:160,ascent_m:2000,intent:'faster',weekly_hours:8,days_available:['mon','wed','fri','sun']})})
 it('never saves on preview and applies the confirmed normalized goal',async()=>{
 const goal=makeGoalInput(EMPTY_BRIEF,'threshold',6,[true,false,true,false,true,false,false]);goal.target_date='2026-11-09'
 vi.mocked(previewPlanGoal).mockResolvedValue({goal,focus:'threshold',focus_label:'FTP aufbauen',rationale:'Für längere Belastungen.',event_duration_hours:2,duration_estimated:false,long_ride_target_minutes:120,weeks_remaining:8,climbing:false})
 vi.mocked(applyPlanGoal).mockResolvedValue({rebuilt:true})
 const close=vi.fn();render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Composer focus="threshold" hours={6} days={[true,false,true,false,true,false,false]} onClose={close}/></MemoryRouter></QueryClientProvider>)
 fireEvent.click(screen.getByRole('button',{name:'Planvorschau'}));await screen.findByRole('button',{name:'Plan aktivieren'});expect(applyPlanGoal).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Plan aktivieren'}));await waitFor(()=>expect(applyPlanGoal).toHaveBeenCalledWith(goal));await waitFor(()=>expect(close).toHaveBeenCalledOnce())
 })
 it('never invents course numbers for presets',()=>{const p=makeGoalInput(EMPTY_BRIEF,'vo2',4,[true]);expect(p.distance_km).toBeUndefined();expect(p.target_date).toBeUndefined();expect(p.intent).toBe('faster')})
})

describe('focus combinations without an event',()=>{
 const mount=()=>render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Composer focus="choose" hours={6} days={[true,false,true,false,true,false,false]} onClose={vi.fn()}/></MemoryRouter></QueryClientProvider>)
 it('opens focus selection rather than an event form',()=>{mount();expect(screen.getByRole('heading',{name:'Was möchtest du verbessern?'})).toBeTruthy();expect(screen.queryByRole('textbox',{name:/Name deines Vorhabens/})).toBeNull();expect((screen.getByRole('button',{name:'Meine Trainingszeit'}) as HTMLButtonElement).disabled).toBe(true)})
 it('sends both selected focuses with no invented date or course',async()=>{
  vi.mocked(previewPlanGoal).mockRejectedValue(new Error('offline'))
  mount();fireEvent.click(screen.getByRole('button',{name:/Ausdauer Länger/}));fireEvent.click(screen.getByRole('button',{name:/VO₂max Intensive/}));fireEvent.click(screen.getByRole('button',{name:'Meine Trainingszeit'}));fireEvent.click(screen.getByRole('button',{name:'Planvorschau'}));
  await waitFor(()=>expect(previewPlanGoal).toHaveBeenCalledOnce());const input=vi.mocked(previewPlanGoal).mock.calls[0][0];expect(input.focuses).toEqual(['endurance','vo2']);expect(input.target_date).toBeUndefined();expect(input.distance_km).toBeUndefined();expect(applyPlanGoal).not.toHaveBeenCalled()
 })
 it('preserves selected focuses when returning from training availability',()=>{mount();fireEvent.click(screen.getByRole('button',{name:/FTP Mehr/}));fireEvent.click(screen.getByRole('button',{name:'Meine Trainingszeit'}));fireEvent.click(screen.getByRole('button',{name:'Zurück'}));expect(screen.getByRole('button',{name:/FTP Mehr/}).getAttribute('aria-pressed')).toBe('true')})
 it('offers an event only through the explicit event action',()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Für ein Event trainieren'}));expect(screen.getByRole('heading',{name:'Wofür fährst du?'})).toBeTruthy();expect((screen.getByRole('button',{name:'Meine Trainingszeit'}) as HTMLButtonElement).disabled).toBe(true)})
})

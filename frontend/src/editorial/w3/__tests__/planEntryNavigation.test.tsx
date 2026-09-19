import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {afterEach,describe,it,expect,vi} from 'vitest'
import W3PlanExperience from '../W3PlanExperience'
import {beforeVm} from '../../../review-plan/data'
vi.mock('../W3TopBar',()=>({default:()=>null}))
vi.mock('../W3TabBar',()=>({default:()=>null}))
vi.mock('../W3PowerProfile',()=>({default:()=>null}))
vi.mock('../W3PlanIntro',()=>({default:({autoShow}:{autoShow:boolean})=><span data-testid="intro-mode">{String(autoShow)}</span>}))
vi.mock('../W3PlanGoalComposer',()=>({default:({onClose}:{onClose:()=>void})=><button onClick={onClose}>Close composer</button>}))
vi.mock('../../../hooks/usePlanAdaptations',()=>({usePlanAdaptations:()=>({})}))
vi.mock('../W3ProgressAnalytics',()=>({useProgressExplorer:()=>({}),W3ProgressAnalyticsView:()=>null}))
afterEach(cleanup)
describe('plan invitation navigation',()=>{
 it('opens a composer when the invitation changes the query on the mounted plan page',()=>{
  const close=vi.fn()
  // W3PlanExperience ruft seit dem Tagestausch useQueryClient(), um nach einem
  // Tausch die Planabfrage zu entwerten. EIN Client ueber alle rerender hinweg:
  // ein neuer je Durchlauf wuerde den Baum verwerfen und den Test sinnlos machen.
  const qc=new QueryClient({defaultOptions:{queries:{enabled:false},mutations:{retry:false}}})
  const view=(choose:boolean)=><QueryClientProvider client={qc}><MemoryRouter><W3PlanExperience vm={beforeVm} state="empty" userId={7} onRebuild={async()=>true} onOpenSession={()=>{}} onCreatedDone={()=>{}} weekOffset={0} onWeekOffset={()=>{}} initialCompose={choose} onComposeClose={close}/></MemoryRouter></QueryClientProvider>
  const result=render(view(false))
  expect(screen.queryByText('Close composer')).toBeNull()
  result.rerender(view(true))
  fireEvent.click(screen.getByText('Close composer'))
  expect(close).toHaveBeenCalledOnce()
  result.rerender(view(false))
  expect(screen.queryByText('Close composer')).toBeNull()
  expect(screen.getByTestId('intro-mode').textContent).toBe('false')
 })
})

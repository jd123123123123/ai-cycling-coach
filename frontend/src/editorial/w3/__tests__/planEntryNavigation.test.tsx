import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
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
  const view=(choose:boolean)=><MemoryRouter><W3PlanExperience vm={beforeVm} state="empty" userId={7} onRebuild={async()=>true} onOpenSession={()=>{}} onCreatedDone={()=>{}} weekOffset={0} onWeekOffset={()=>{}} initialCompose={choose} onComposeClose={close}/></MemoryRouter>
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

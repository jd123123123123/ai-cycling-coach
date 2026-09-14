// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {MemoryRouter, useNavigate, Routes, Route} from 'react-router-dom'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import W3SceneUnlockNudge from '../W3SceneUnlockNudge'
const state=vi.hoisted(()=>({userId:1 as number|null,status:'ok',image:vi.fn(),updates:vi.fn()}))
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:state.userId?{id:state.userId}:null})}))
vi.mock('../../../api/stageGallery',()=>({fetchStageUpdates:()=>state.updates(),fetchStageImage:(id:string)=>state.image(id)}))
vi.mock('../../../hooks/useGarage',()=>({useSelectStage:()=>({mutateAsync:vi.fn(),isPending:false})}))
vi.mock('../../../hooks/useReferrals',()=>({useMyReferrals:()=>({data:{code:'DEMO'}})}))
vi.mock('../../../api/referral',()=>({fetchMyReferrals:vi.fn()}))
vi.mock('../W3SceneCollection',()=>({SceneCollectionView:({data}:{data:{stages:{image:string}[]}})=><div role="dialog">{data.stages[0].image}</div>}))
function Shell(){const go=useNavigate();return <><W3SceneUnlockNudge/><button onClick={()=>go('/e/w3-rides')}>Route wechseln</button><Routes><Route path="/e/w3-wins" element={<h1>Erfolge</h1>}/></Routes></>}
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const node=()=> <QueryClientProvider client={client}><MemoryRouter initialEntries={['/e/w3-today']}><Shell/></MemoryRouter></QueryClientProvider>; const result=render(node());return {...result,refresh:()=>result.rerender(node())}}
beforeEach(()=>{localStorage.clear();state.userId=1;state.status='ok';state.image.mockReset().mockResolvedValue('personal-bike');state.updates.mockReset().mockImplementation(async()=>({stages:[{id:'startrampe',owned:true,starter:false,plate_url:'/plate',activity_id:200,render_status:state.status,image:null}],owned_count:1,total_count:1}))})
afterEach(cleanup)
describe('automatic scene notification',()=>{
 it('loads image only on reveal and isolates accounts',async()=>{const view=mount();const button=await screen.findByRole('button',{name:'Neue Kulisse enthüllen'});expect(state.image).not.toHaveBeenCalled();fireEvent.click(button);expect((await screen.findByRole('dialog')).textContent).toBe('personal-bike');expect(state.image).toHaveBeenCalledWith('startrampe');expect(localStorage.getItem('ridr:scene-revealed:v1:1:startrampe')).toBe('seen');state.userId=2;view.refresh();expect(screen.queryByRole('dialog')).toBeNull();expect(await screen.findByRole('button',{name:'Neue Kulisse enthüllen'})).toBeTruthy()})
 it('discards images completing after account changes',async()=>{let resolve!:(s:string)=>void;state.image.mockImplementation(()=>new Promise<string>(r=>{resolve=r}));const view=mount();fireEvent.click(await screen.findByRole('button',{name:'Neue Kulisse enthüllen'}));state.userId=2;view.refresh();await act(async()=>resolve('old-account-bike'));expect(screen.queryByRole('dialog')).toBeNull();expect(localStorage.getItem('ridr:scene-revealed:v1:2:startrampe')).toBeNull()})
 it('clears an open result on navigation and logout',async()=>{const view=mount();fireEvent.click(await screen.findByRole('button',{name:'Neue Kulisse enthüllen'}));await screen.findByRole('dialog');fireEvent.click(screen.getByText('Route wechseln'));expect(screen.queryByRole('dialog')).toBeNull();state.userId=null;view.refresh();expect(screen.queryByText('Neue Kulisse freigeschaltet')).toBeNull()})
 it('does not enable a pending image or mark it seen',async()=>{state.status='pending';mount();expect((await screen.findByRole('button',{name:/dein Bild wird vorbereitet/}) as HTMLButtonElement).disabled).toBe(true);expect(state.image).not.toHaveBeenCalled();expect(localStorage.length).toBe(0)})
 it('offers achievements when image delivery fails',async()=>{state.image.mockRejectedValue(new Error('offline'));mount();fireEvent.click(await screen.findByRole('button',{name:'Neue Kulisse enthüllen'}));fireEvent.click(await screen.findByRole('button',{name:'Neue Kulisse in Erfolge ansehen'}));expect(await screen.findByRole('heading',{name:'Erfolge'})).toBeTruthy();expect(localStorage.length).toBe(0)})
 it('does not request signed-out rider data',async()=>{state.userId=null;mount();await waitFor(()=>expect(state.updates).not.toHaveBeenCalled())})
})

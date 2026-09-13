import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoGarminSync } from '../useAutoGarminSync'
import type { GarminStatus } from '../../api/dashboard'

const api = vi.hoisted(() => ({ status:vi.fn(), sync:vi.fn() }))
vi.mock('../../api/dashboard',()=>({fetchGarminStatus:api.status}))
vi.mock('../../api/garmin',()=>({forceGarminSync:api.sync}))
const NOW = Date.UTC(2026,8,13,6)
let status: GarminStatus
let hidden = false
let online = true
let qc: QueryClient
function Driver({id=1}:{id?:number}) { useAutoGarminSync(id); return null }
function mount(strict=false,id=1) {
  qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})
  return render(<QueryClientProvider client={qc}>{strict?<StrictMode><Driver id={id}/></StrictMode>:<Driver id={id}/>}</QueryClientProvider>)
}
const tick=async(ms=1)=>{await act(async()=>{await vi.advanceTimersByTimeAsync(ms)})}
const foreground=()=>{hidden=false;document.dispatchEvent(new Event('visibilitychange'))}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(NOW);localStorage.clear();hidden=false;online=true
  vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden)
  vi.spyOn(navigator,'onLine','get').mockImplementation(()=>online)
  status={connected:true,sync_enabled:true,sync_status:'ok',last_sync_at:new Date(NOW-10_000).toISOString()}
  api.status.mockReset().mockImplementation(async()=>({...status}))
  api.sync.mockReset().mockImplementation(async()=>{status={...status,last_sync_at:new Date(Date.now()).toISOString()};return {activities_synced:1,metrics_days:1,message:'ok'}})
})
afterEach(()=>{cleanup();qc?.clear();vi.restoreAllMocks();vi.useRealTimers()})
describe('automatic Garmin sync across the app',()=>{
  it('starts on entry even when the previous sync is only ten seconds old',async()=>{
    mount();await tick();expect(api.sync).toHaveBeenCalledTimes(1)
  })
  it('does not duplicate startup under StrictMode or quick focus events',async()=>{
    mount(true);await tick();window.dispatchEvent(new Event('focus'));foreground();window.dispatchEvent(new Event('pageshow'));await tick();expect(api.sync).toHaveBeenCalledTimes(1)
  })
  it('syncs after backgrounding and does not poll while hidden',async()=>{
    mount();await tick();hidden=true;document.dispatchEvent(new Event('visibilitychange'));const calls=api.status.mock.calls.length
    await tick(60_000);expect(api.status).toHaveBeenCalledTimes(calls)
    foreground();await tick();expect(api.sync).toHaveBeenCalledTimes(2)
  })
  it('waits offline and automatically starts when connectivity returns',async()=>{
    online=false;mount();await tick();expect(api.status).not.toHaveBeenCalled();expect(api.sync).not.toHaveBeenCalled()
    online=true;window.dispatchEvent(new Event('online'));await tick();expect(api.sync).toHaveBeenCalledTimes(1)
  })
  it.each([{connected:false},{sync_enabled:false},{sync_status:'auth_error'}])('respects unavailable or disabled connections: %o',async patch=>{
    status={...status,...patch} as GarminStatus;mount();await tick(60_000);expect(api.sync).not.toHaveBeenCalled()
  })
  it('adopts an existing server job and refreshes readiness and rides when it finishes',async()=>{
    status={...status,sync_status:'syncing'};mount();const invalidated=vi.spyOn(qc,'invalidateQueries');await tick();expect(api.sync).not.toHaveBeenCalled();invalidated.mockClear()
    status={...status,sync_status:'ok',last_sync_at:new Date(NOW).toISOString()};await tick(5_000)
    expect(api.sync).not.toHaveBeenCalled()
    expect(invalidated.mock.calls.some(([args])=>JSON.stringify(args?.queryKey)==='["readiness","decision"]')).toBe(true)
    expect(invalidated.mock.calls.some(([args])=>JSON.stringify(args?.queryKey)==='["activities"]')).toBe(true)
  })
  it('observes a new scheduler result even without a syncing status transition',async()=>{
    mount();await tick();const invalidated=vi.spyOn(qc,'invalidateQueries');await tick(5_000);invalidated.mockClear()
    status={...status,last_sync_at:new Date(NOW+20_000).toISOString()};await tick(30_000)
    expect(invalidated).toHaveBeenCalledWith({queryKey:['daily-metrics']});expect(api.sync).toHaveBeenCalledTimes(1)
  })
  it('recovers after a failed attempt without waiting for a day or a page reload',async()=>{
    api.sync.mockRejectedValueOnce(new Error('network'));mount();await tick();expect(api.sync).toHaveBeenCalledTimes(1)
    await tick(29_000);expect(api.sync).toHaveBeenCalledTimes(1)
    await tick(2_000);expect(api.sync).toHaveBeenCalledTimes(2)
  })
  it('does not loop on a conflict with a server job',async()=>{
    api.sync.mockImplementationOnce(async()=>{status.sync_status='syncing';throw {response:{status:409}}})
    mount();await tick(20_000);expect(api.sync).toHaveBeenCalledTimes(1);expect(api.status.mock.calls.length).toBeGreaterThan(2)
  })
  it('stops listeners and requests after unmount',async()=>{
    const view=mount();await tick();view.unmount();const calls=api.status.mock.calls.length
    await tick(300_000);foreground();window.dispatchEvent(new Event('online'));await tick();expect(api.status).toHaveBeenCalledTimes(calls)
  })
  it('lets another tab own the sync while continuing to observe the server',async()=>{
    Object.defineProperty(navigator,'locks',{configurable:true,value:{request:vi.fn(async(_name,_options,run)=>run(null))}})
    try { mount();await tick();expect(api.sync).not.toHaveBeenCalled();expect(navigator.locks.request).toHaveBeenCalled() }
    finally { Reflect.deleteProperty(navigator,'locks') }
  })
  it('does not inherit the previous rider’s recent-attempt suppression',async()=>{
    localStorage.setItem('ridr.garmin.attempt.1',String(NOW));mount(false,2);await tick();expect(api.sync).toHaveBeenCalledTimes(1)
  })
})

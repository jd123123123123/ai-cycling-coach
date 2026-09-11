import { createElement, type ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { apiClient } from '../../api/client'
import { useTodayWeather } from '../useTodayWeather'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function setup(denied=false) {
  const gps=vi.fn((success: (position: {coords:{latitude:number;longitude:number}})=>void, failure: (error:{code:number})=>void)=>denied?failure({code:1}):success({coords:{latitude:52.51234,longitude:13.41234}}))
  vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:gps},permissions:{query:vi.fn().mockResolvedValue({state:'prompt',addEventListener:vi.fn(),removeEventListener:vi.fn()})}})
  const post=vi.spyOn(apiClient,'post').mockResolvedValue({data:{available:true,timezone:'Europe/Berlin',hours:[],location_source:'device'}})
  const query=new QueryClient({defaultOptions:{queries:{retry:false}}})
  const wrapper=({children}:{children:ReactNode})=>createElement(QueryClientProvider,{client:query},children)
  const hook=renderHook(()=>useTodayWeather(),{wrapper})
  return {hook,gps,post}
}
it('requests permission on intent and sends the rounded location in a POST body',async()=>{
  const {hook,gps,post}=setup()
  expect(gps).not.toHaveBeenCalled()
  act(()=>hook.result.current.requestLocation())
  await waitFor(()=>expect(hook.result.current.data?.available).toBe(true))
  expect(post).toHaveBeenCalledWith('/weather/here',expect.objectContaining({lat:52.51,lng:13.41}))
})
it('does not call the weather endpoint after denied location permission',async()=>{
  const {hook,post}=setup(true)
  act(()=>hook.result.current.requestLocation())
  await waitFor(()=>expect(hook.result.current.locationState).toBe('error'))
  expect(post).not.toHaveBeenCalled()
  expect(hook.result.current.data).toBeUndefined()
})

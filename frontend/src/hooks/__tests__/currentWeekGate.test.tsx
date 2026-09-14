import {renderHook,waitFor,cleanup} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,it,expect,vi} from 'vitest'
import type {ReactNode} from 'react'
import {useCurrentWeek} from '../useCurrentWeek'
import {fetchCurrentWeek} from '../../api/weeks'
vi.mock('../useLanguage',()=>({useLanguage:()=>({language:'de'})}))
vi.mock('../../contexts/LocaleContext',()=>({useLocale:()=>({locale:'de'})}))
vi.mock('../../api/weeks',()=>({fetchCurrentWeek:vi.fn(async()=>({days:[]}))}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('does not invoke the legacy generating week read until a saved active plan is confirmed',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>
 const {rerender}=renderHook(({enabled})=>useCurrentWeek(0,enabled),{initialProps:{enabled:false},wrapper})
 expect(fetchCurrentWeek).not.toHaveBeenCalled()
 rerender({enabled:true})
 await waitFor(()=>expect(fetchCurrentWeek).toHaveBeenCalledOnce())
 client.clear()
})

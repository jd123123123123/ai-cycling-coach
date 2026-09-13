import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AutoGarminSync from '../AutoGarminSync'
const state=vi.hoisted(()=>({user:null as {id:number}|null,isLoading:false,sync:vi.fn()}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>state}))
vi.mock('../../hooks/useAutoGarminSync',()=>({useAutoGarminSync:(id:number)=>state.sync(id)}))
beforeEach(()=>{state.user=null;state.isLoading=false;state.sync.mockClear()})
afterEach(cleanup)
it('does not start any sync while session restoration is pending or signed out',()=>{
 const view=render(<AutoGarminSync/>);expect(state.sync).not.toHaveBeenCalled()
 state.user={id:7};state.isLoading=true;view.rerender(<AutoGarminSync/>);expect(state.sync).not.toHaveBeenCalled()
})
it('starts only for the authenticated rider and stops rendering the controller on sign-out',()=>{
 state.user={id:7};const view=render(<AutoGarminSync/>);expect(state.sync).toHaveBeenLastCalledWith(7)
 state.user={id:9};view.rerender(<AutoGarminSync/>);expect(state.sync).toHaveBeenLastCalledWith(9)
 state.sync.mockClear();state.user=null;view.rerender(<AutoGarminSync/>);expect(state.sync).not.toHaveBeenCalled()
})

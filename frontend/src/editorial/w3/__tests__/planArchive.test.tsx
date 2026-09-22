// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import W3PlanHistory from '../W3PlanArchiveSheet'
import {PLAN_HISTORY_PREVIEW} from '../planHistoryPreview'
beforeEach(()=>{HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','')});HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.removeAttribute('open')})})
afterEach(cleanup)
const mount=(items=PLAN_HISTORY_PREVIEW)=>{const close=vi.fn();render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><W3PlanHistory preview={items} onClose={close}/></MemoryRouter></QueryClientProvider>);return close}
it('opens a saved plan, switches metrics and weeks and closes',()=>{
 const close=mount();fireEvent.click(screen.getByRole('button',{name:/FTP \+ Ausdauer/}))
 expect(screen.getByText('+18')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'VO₂max'}));expect(screen.getByText('+3')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Trainingswochen'}))
 fireEvent.click(screen.getByRole('button',{name:/Woche 2: Ist/}))
 expect(screen.getByText('Woche 2')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Schließen'}));expect(close).toHaveBeenCalledTimes(1)
})
it('does not suggest a fabricated historic plan when nothing was saved',()=>{
 mount([]);expect(screen.getByText('Hier bleibt dein Fortschritt.')).toBeTruthy();expect(screen.queryByText('FTP + Ausdauer')).toBeNull()
})

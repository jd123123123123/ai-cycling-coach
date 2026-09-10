import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DailyMetric } from '../../../api/dashboard'
import { historyDays, periodSummary, shiftDay } from '../w3MetricHistory'
import Sheet from '../W3MetricHistorySheet'
import Dock from '../W3TodayDock'
const end='2026-09-09'
const rows=Array.from({length:180},(_,i)=>({date:shiftDay(end,i-179),recorded_at:`${shiftDay(end,i-179)}T12:00:00Z`,hrv_status:i+1,hrv_nightly_mean:i+1,resting_hr:50,sleep_detail:{total_s:8*3600,deep_s:3600,rem_s:7200,light_s:5*3600}} as DailyMetric))
beforeAll(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
})
afterEach(cleanup)
function renderSheet(data=rows,initialMetric:'hrv'|'rhr'|'sleep'='hrv') {
 const qc=new QueryClient({defaultOptions:{queries:{enabled:false,retry:false}}})
 qc.setQueryData(['w3','recovery-history',end],{metrics:data,count:data.length})
 const close=vi.fn()
 render(<QueryClientProvider client={qc}><Sheet initialMetric={initialMetric} endDate={end} onClose={close}/></QueryClientProvider>)
 return close
}
describe('recovery history integrity',()=>{
 it('computes selected period averages and matching preceding windows',()=>{
   expect(periodSummary(rows,'hrv',end,7)).toMatchObject({mean:177,change:7,count:7})
   expect(periodSummary(rows,'hrv',end,28)).toMatchObject({mean:166.5,change:28,count:28})
   expect(periodSummary(rows,'hrv',end,90)).toMatchObject({mean:135.5,change:90,count:90})
 })
 it('keeps missing calendar days and suppresses under-sampled comparisons',()=>{
   const partial=rows.slice(-2)
   const days=historyDays(partial,'hrv',end,7)
   expect(days).toHaveLength(7)
   expect(days[0].value).toBeNull()
   expect(days.at(-1)?.trend).toBeNull()
   expect(periodSummary(partial,'hrv',end,7).change).toBeNull()
 })
 it('does not mix five-minute peaks or weekly averages into nightly HRV',()=>{
   expect(historyDays([{...rows.at(-1)!,hrv_nightly_mean:null,hrv_status:150}],'hrv',end,1)[0].value).toBeNull()
 })
 it('uses only prior observations for the personal band',()=>{
   const first=historyDays(rows,'hrv',end,1)[0]
   expect(first.baselineCount).toBe(28)
   expect(first.baseline).toBe(165.5)
   expect(first.high).toBeLessThan(first.value!)
 })
 it('uses source dates rather than upload dates and does not invent missing sleep',()=>{
   expect(historyDays([{...rows.at(-1)!,recorded_at:'2026-09-12T12:00:00Z',sleep_detail:null}],'sleep',end,1)[0].value).toBeNull()
   expect(historyDays([{...rows.at(-1)!,recorded_at:'2026-09-12T12:00:00Z'}],'rhr',end,1)[0].value).toBe(50)
 })
})
describe('recovery sheet interactions',()=>{
 it('updates the mean with timeframe and preserves it while inspecting a day',()=>{
   renderSheet()
   expect(screen.getByLabelText('Durchschnitt im Zeitraum').textContent).toContain('167')
   fireEvent.click(screen.getByRole('button',{name:'7 Tage'}))
   expect(screen.getByLabelText('Durchschnitt im Zeitraum').textContent).toContain('177')
   fireEvent.change(screen.getByRole('slider'),{target:{value:'0'}})
   expect(screen.getByLabelText('Durchschnitt im Zeitraum').textContent).toContain('177')
   expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toContain('174 ms')
   fireEvent.click(screen.getByRole('button',{name:'90 Tage'}))
   expect(screen.getByLabelText('Durchschnitt im Zeitraum').textContent).toContain('136')
 })
 it('switches metric and replaces context rather than appending expanded paragraphs',()=>{
   renderSheet()
   fireEvent.click(screen.getByRole('button',{name:'Schlaf'}))
   expect(screen.getByLabelText('Schlafphasen')).toBeTruthy()
   fireEvent.click(screen.getByRole('button',{name:'Vergleich'}))
   expect(screen.getByText('Orientierung für Erwachsene')).toBeTruthy()
   fireEvent.click(screen.getByRole('button',{name:'Verstehen'}))
   expect(screen.queryByText('Orientierung für Erwachsene')).toBeNull()
   expect(screen.getByText('Schlaf verstehen')).toBeTruthy()
   fireEvent.click(screen.getByRole('button',{name:'Grafik erklären'}))
   expect(screen.queryByRole('slider')).toBeNull()
   fireEvent.click(screen.getByRole('button',{name:'Zur Grafik'}))
   expect(screen.getByRole('slider')).toBeTruthy()
 })
 it('shows absent readings honestly and supports explicit closing',()=>{
   const close=renderSheet([])
   expect(screen.getByText('Keine Messungen in diesem Zeitraum.')).toBeTruthy()
   fireEvent.click(screen.getByRole('button',{name:'Verlauf schließen'}))
   expect(close).toHaveBeenCalledOnce()
 })
 it('opens each dock metric without collapsing readiness or nesting buttons',()=>{
   const qc=new QueryClient({defaultOptions:{queries:{enabled:false}}});qc.setQueryData(['w3','recovery-history',end],{metrics:rows})
   const {container}=render(<QueryClientProvider client={qc}><Dock endDate={end} vm={{score:70,state:'Bereit',scoreNote:null,bonus:null,compact:true,stats:[{label:'HRV',value:'73'},{label:'RUHEPULS',value:'45'},{label:'SCHLAF',value:'8:00'}]}}/></QueryClientProvider>)
   fireEvent.click(screen.getByRole('button',{name:'Bereitschaft im Detail'}))
   expect(container.querySelector('button button')).toBeNull()
   fireEvent.click(screen.getByRole('button',{name:'HRV Verlauf öffnen'}))
   expect(screen.getByRole('dialog')).toBeTruthy()
   fireEvent.click(screen.getByRole('button',{name:'Verlauf schließen'}))
   expect(screen.getByRole('button',{name:'Bereitschaft im Detail'}).getAttribute('aria-expanded')).toBe('true')
 })
})

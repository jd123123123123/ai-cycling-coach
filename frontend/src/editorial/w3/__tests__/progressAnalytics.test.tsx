import { W3ProgressCompactView } from '../W3ProgressCompact'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProgressTrend, ProgressRecords, W3ProgressAnalyticsView, ProgressCalendarSelector, calendarPeriodStart, shiftCalendarPeriod } from '../W3ProgressAnalytics'
import type { ProgressExplorer } from '../../../api/progressExplorer'
afterEach(cleanup)
const metric={points:[{date:'2026-09-02',value:240,source:'test'},{date:'2026-09-09',value:248,source:'test'}],baseline:{date:'2026-08-30',value:235,source:'test'},current:248,target:280}
const data:ProgressExplorer={period:'month',start:'2026-09-01',end:'2026-09-10',plan_start:'2026-08-24',plan_note:'Aktueller Vierwochenplan',ftp:metric,vo2:{...metric,points:[],baseline:null,current:null,target:null},records:[{seconds:300,watts:300,all_time_watts:320,previous_watts:290,date:'2026-09-08',activity_id:42}]}
it('switches periods and metrics with explicit selected state',()=>{
 const periods:string[]=[]
 render(<W3ProgressAnalyticsView data={data} period="month" onPeriod={p=>periods.push(p)}/>)
 fireEvent.click(screen.getByRole('button',{name:'Woche'}))
 expect(periods).toEqual(['week'])
 fireEvent.click(screen.getByRole('button',{name:'Rekorde'}))
 expect(screen.getByRole('img',{name:/Leistungskurve/})).toBeTruthy()
 expect(screen.queryByText('Ganzer Plan')).toBeNull()
})
it('scrubs dated measurements using a keyboard-accessible range',()=>{
 render(<ProgressTrend showDetails metric={metric} start="2026-09-01" end="2026-09-10" kind="ftp"/>)
 fireEvent.change(screen.getByRole('slider',{name:'Messung auswählen'}),{target:{value:'0'}})
 expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toContain('240')
 expect(screen.getByText('Noch 32 W')).toBeTruthy()
})
it('does not manufacture a trend from the current value alone',()=>{
 render(<ProgressTrend metric={{...metric,points:[]}} start="2026-09-01" end="2026-09-10" kind="ftp"/>)
 expect(screen.queryByRole('img')).toBeNull()
 expect(screen.queryByRole('slider')).toBeNull()
})
it('opens the source ride for a period record',()=>{
 const ids:number[]=[]
 render(<ProgressRecords showDetails records={data.records} onRide={id=>ids.push(id)}/>)
 fireEvent.click(screen.getByRole('button',{name:/Fahrt vom/}))
 expect(ids).toEqual([42])
 expect(screen.getByText('−20 W zum Bestwert')).toBeTruthy()
})

it('compares the preceding period directly inside the record graph, not the lifetime best',()=>{
 render(<ProgressRecords records={data.records} start="2026-09-01" end="2026-09-10"/>)
 const graph=screen.getByRole('img',{name:/Leistungskurve/})
 expect(graph.getAttribute('aria-label')).toContain('Vorher 290 W, Jetzt 300 W, Veränderung +10 W')
 expect(graph.textContent).toContain('+10 W')
 expect(graph.textContent).toContain('22. Aug. – 31. Aug.')
})
it('does not invent a change when the previous period has no record',()=>{
 render(<ProgressRecords records={[{...data.records[0],previous_watts:null}]}/>)
 expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Vorher — W')
 expect(screen.queryByText('+300 W')).toBeNull()
})

it('selects real historical years and prevents advancing past the current period',()=>{
 const selected:string[]=[]
 render(<ProgressCalendarSelector period="year" today="2026-09-10" onSelect={value=>selected.push(value)}/>)
 fireEvent.click(screen.getByRole('button',{name:'2025'}))
 expect(selected).toEqual(['2025-01-01'])
 expect(screen.getByRole('button',{name:'Nächster Kalenderzeitraum'}).hasAttribute('disabled')).toBe(true)
 fireEvent.keyDown(screen.getByRole('button',{name:'2026'}),{key:'ArrowLeft'})
 expect(selected.at(-1)).toBe('2025-01-01')
})
it('uses calendar boundaries across month and ISO-week year changes',()=>{
 expect(calendarPeriodStart('week','2026-01-01')).toBe('2025-12-29')
 expect(shiftCalendarPeriod('month','2026-01-20',-1)).toBe('2025-12-01')
 expect(shiftCalendarPeriod('month','2024-02-29',1)).toBe('2024-03-01')
})

it('selects the centered period only after a user swipe settles',()=>{
 vi.useFakeTimers()
 try {
  const selected:string[]=[]
  render(<ProgressCalendarSelector period="year" today="2026-09-10" onSelect={value=>selected.push(value)}/>)
  const rail=screen.getByLabelText('Kalenderzeitraum auswählen')
  rail.getBoundingClientRect=()=>new DOMRect(0,0,200,40)
  Array.from(rail.querySelectorAll('button')).forEach(button=>{button.getBoundingClientRect=()=>new DOMRect(button.textContent==='2025'?80:250,0,40,30)})
  // The initial/programmatic scroll is not user intent.
  Object.defineProperty(rail,'scrollLeft',{value:30,writable:true})
  fireEvent.scroll(rail)
  act(()=>vi.advanceTimersByTime(250))
  expect(selected).toEqual([])
  fireEvent.pointerDown(rail)
  rail.scrollLeft=90
  fireEvent.scroll(rail)
  act(()=>vi.advanceTimersByTime(250))
  expect(selected).toEqual([]) // Finger/pointer still held.
  fireEvent.pointerUp(rail)
  act(()=>vi.advanceTimersByTime(250))
  expect(selected).toEqual(['2025-01-01'])
  fireEvent.scroll(rail)
  act(()=>vi.advanceTimersByTime(250))
  expect(selected).toHaveLength(1) // No repeated query from re-centering.
 } finally {vi.useRealTimers()}
})

it('compact performance uses measured history and never draws a made-up FTP target bar',()=>{
 const {rerender}=render(<W3ProgressCompactView fallbackFtp={240}/>)
 expect(screen.getByText('240')).toBeTruthy()
 expect(screen.queryByRole('img')).toBeNull()
 expect(screen.queryByRole('progressbar')).toBeNull()
 rerender(<W3ProgressCompactView fallbackFtp={240} data={data}/>)
 expect(screen.getByRole('img',{name:'Gespeicherter Verlauf von 240 auf 248'})).toBeTruthy()
 expect(screen.queryByText('5-Minuten-Rekord')).toBeNull()
 expect(screen.queryByText('300 W')).toBeNull()
})


it('keeps methodology out of the default view and reveals it on demand',()=>{
 render(<W3ProgressAnalyticsView data={data} period="month" onPeriod={()=>{}}/>)
 expect(screen.queryByText(/Gespeicherte FTP-Werte/)).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Daten und Vergleich erklären'}))
 expect(screen.getByText(/Gespeicherte FTP-Werte/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Daten und Vergleich erklären'}))
 expect(screen.queryByText(/Gespeicherte FTP-Werte/)).toBeNull()
})

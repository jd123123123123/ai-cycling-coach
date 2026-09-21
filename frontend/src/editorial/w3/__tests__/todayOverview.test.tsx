import { useState } from 'react'
import { W3FormCardView } from '../W3FormCard'
import type { W3DayFull } from '../W3Sections'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { W3TodayOverviewView, type OverviewData } from '../W3TodayOverview'
import type { W3Vm } from '../W3TodayView'
import W3TodayDock from '../W3TodayDock'
import W3ReadinessSpectrum from '../W3ReadinessSpectrum'
import { readinessBand } from '../w3ReadinessBands'
import { formStory } from '../w3FormStory'
import { step, type FormPoint } from '../w3TrainingImpact'

afterEach(cleanup)
const vm = { weekDays: [{status:'today',rest:true,letter:'M'}], hasPlan:true, weekLoadLabel:'0 von 92 TSS', weekGoal:null } as W3Vm
const data: OverviewData = { form:{ctl:16.2,atl:1,tsb:15.2}, crew:null, crewState:'ready', ftp:240, ftpGoal:350 }

describe('Today overview', () => {
  it('keeps details off the quick view and opens only the requested section', async () => {
    render(<W3TodayOverviewView vm={vm} data={data} week={<p>Wocheninhalt</p>} form={<p>Forminhalt</p>} crew={<p>Crewinhalt</p>} goals={<p>Zielinhalt</p>} />)
    expect(screen.getByRole('button',{name:'Heute öffnen'})).toBeTruthy()
    expect(screen.queryByText('Forminhalt')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:/Deine Form/}))
    expect(screen.getByText('Forminhalt')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:/Deine Woche/}))
    await waitFor(() => expect(screen.queryByText('Forminhalt')).toBeNull())
    expect(screen.getByText('Wocheninhalt')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Deine Woche schließen'}))
    await waitFor(() => expect(screen.queryByText('Wocheninhalt')).toBeNull())
    expect(screen.getByRole('button',{name:'Deine Woche öffnen'}).getAttribute('aria-expanded')).toBe('false')
  })
  it('shows the real plan phase and opens goal setup when no plan exists', () => {
    const picks: unknown[] = []
    const props = { data, today:null, week:null, form:null, crew:null, goals:null, onPickGoal:(intent: unknown) => picks.push(intent) }
    const { rerender } = render(<W3TodayOverviewView {...props} vm={{...vm,planPhase:'Aufbaublock · Woche 2'}} />)
    expect(screen.getByText('Aufbaublock · Woche 2')).toBeTruthy()
    rerender(<W3TodayOverviewView {...props} vm={{...vm,hasPlan:false,planPhase:null}} />)
    expect(screen.queryByText('Aufbaublock · Woche 2')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'FTP steigern'}))
    fireEvent.click(screen.getByRole('button',{name:'Eigenes Ziel'}))
    expect(picks).toEqual(['ftp',null])
  })
  it('shows today’s prescription but suppresses stale training facts and bars for rest or no plan', () => {
    const training = {...vm, weekDays:[{status:'today',rest:false,title:'4 × 8 Schwelle',targetW:'285 W',planned:112,letter:'M'}],sessionDur:'1 Std. 15 min',sessionBlocks:[{w:.8,work:true,label:'Block 1 · 285 W'}]} as W3Vm
    const props = {data,week:null,form:null,crew:null,goals:null}
    const {rerender} = render(<W3TodayOverviewView {...props} vm={training} />)
    expect(screen.getByText('4 × 8 Schwelle')).toBeTruthy()
    expect(screen.getByText('1 Std. 15 min · 285 W · 112 TSS')).toBeTruthy()
    expect(screen.getByRole('img',{name:'Trainingsprofil: Block 1 · 285 W'})).toBeTruthy()
    rerender(<W3TodayOverviewView {...props} vm={{...training,weekDays:[{...training.weekDays[0],rest:true}]}} />)
    expect(screen.getByText('Ruhetag')).toBeTruthy()
    expect(screen.queryByRole('img',{name:/Trainingsprofil:/})).toBeNull()
    expect(screen.queryByText('1 Std. 15 min · 285 W · 112 TSS')).toBeNull()
    rerender(<W3TodayOverviewView {...props} vm={{...training,hasPlan:false}} />)
    expect(screen.getByText('Noch kein Training geplant')).toBeTruthy()
    expect(screen.queryByRole('img',{name:/Trainingsprofil:/})).toBeNull()
    expect(screen.queryByText('4 × 8 Schwelle')).toBeNull()
  })
  it('does not turn missing data into zero fitness or goal progress', () => {
    render(<W3TodayOverviewView vm={vm} data={{...data,form:null,ftp:null,ftpGoal:null,crewState:'error'}} week={null} form={null} crew={null} goals={null} />)
    expect(screen.getByText('Noch kein Verlauf')).toBeTruthy()
    expect(screen.getByText('Crew nicht verfügbar')).toBeTruthy()
    expect(screen.queryByText('0%')).toBeNull()
  })
})

describe('readiness spectrum', () => {
  it('preserves W3 score boundaries and does not put missing readings at zero', () => {
    expect([0,29,30,44,45,64,65,79,80,100].map(n=>readinessBand(n).word)).toEqual(['Ruhe','Ruhe','Locker','Locker','Solide','Solide','Bereit','Bereit','Topfit','Topfit'])
    const {container}=render(<W3ReadinessSpectrum score={null} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('keine aktuelle Messung')
    expect(container.querySelector('g[transform]')).toBeNull()
  })
})

describe('form summary', () => {
  it('describes falling fitness with low fatigue without claiming a build or an optimum', () => {
    const h:FormPoint[]=[{date:'2026-09-03',ctl:18.8,atl:2.5,tsb:16.3,tss:0}]
    for(let n=4;n<=9;n++)h.push(step(h.at(-1)!,0,`2026-09-0${n}`))
    const text=formStory(h,{today:'2026-09-09',mode:'rest',target:0,plan:[]})
    expect(text).toContain('sinkende Fitness')
    expect(text).toContain('Ruhetag')
    expect(text).not.toMatch(/Optimum|Vollgas|Aufbau/)
    expect(formStory(h,{today:'2026-09-08',mode:'training',target:90,plan:[]})).not.toContain('90 TSS')
  })
})


describe('compact readiness details', () => {
  it('reveals the existing health values without leaving Today', () => {
    render(<W3TodayDock vm={{score:73,state:'Bereit',scoreNote:null,bonus:null,compact:true,showStats:false,stats:[{label:'HRV',value:'67',unit:'ms'},{label:'RUHEPULS',value:'45',unit:'bpm'},{label:'SCHLAF',value:'7:41',unit:'h'}]}} onOpen={() => {}} />)
    const toggle = screen.getByRole('button', {name:'Bereitschaft im Detail'})
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('HRV')).toBeTruthy()
    expect(screen.getByText('67')).toBeTruthy()
    expect(screen.getByRole('button', {name:'Alle Bereitschaftsdetails →'})).toBeTruthy()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })
})


describe('Persistent week and form graphics',()=>{
 const days:W3DayFull[]=Array.from({length:7},(_,i)=>({dateLabel:`Tag ${i+1}`,weekday:`Tag ${i+1}`,targetW:'200 W',ftpPct:'80%',letter:['M','D','M','D','F','S','S'][i],num:String(i+7),status:i===2?'today':'upcoming',rest:false,actual:i===0?40:0,planned:50+i*5,title:`Training ${i+1}`}));
 function WeekHarness(){
  const [selected,setSelected]=useState(2);
  return <W3TodayOverviewView vm={{...vm,weekDays:days} as W3Vm} data={data} selectedWeekDay={selected} onSelectWeekDay={setSelected} week={<p>Details für {days[selected].title}</p>} form={null} crew={null} goals={null}/>;
 }
 it('keeps the same day and bar DOM through opening and closing, with one selectable graph',async()=>{
  render(<WeekHarness/>);
  const graph=screen.getByLabelText('Trainingsbelastung der Woche');
  const day=screen.getByRole('button',{name:/Tag 5: Training 5/});
  const track=day.querySelector('.w3-overview-day-track');
  fireEvent.click(day);
  expect(screen.getByText('Details für Training 5')).toBeTruthy();
  expect(screen.getByRole('button',{name:/Tag 5: Training 5/})).toBe(day);
  expect(day.querySelector('.w3-overview-day-track')).toBe(track);
  expect(day.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getAllByLabelText('Trainingsbelastung der Woche')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Deine Woche schließen'}));
  await waitFor(()=>expect(screen.queryByText('Details für Training 5')).toBeNull());
  expect(screen.getByLabelText('Trainingsbelastung der Woche')).toBe(graph);
  expect(day.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:'Deine Woche öffnen'}));
  expect(screen.getByText('Details für Training 5')).toBeTruthy();
 });
 it('keeps metric bars compact and preserves the mounted detail chart and selected date when reopening',()=>{
  const entries:FormPoint[]=[{date:'2026-09-08',ctl:30,atl:25,tsb:5,tss:40},{date:'2026-09-09',ctl:31,atl:28,tsb:3,tss:50}];
  const {container}=render(<W3TodayOverviewView vm={vm} data={data} week={null} form={null} persistentForm={expanded=><W3FormCardView entries={entries} embedded expanded={expanded}/>} crew={null} goals={null}/>);
  const metrics=['Fitness','Ermüdung','Form'].map(name=>screen.getByRole('button',{name:`${name} erklären`}));
  const bars=metrics.map(metric=>metric.querySelector('svg[viewBox="0 0 86 36"]'));
  bars.forEach(bar=>expect(bar).toBeTruthy());
  const chart=container.querySelector('svg[aria-label^="Fitness und Ermüdung im Tagesverlauf"]');
  expect(chart).toBeTruthy();
  expect(chart?.closest('[inert]')?.getAttribute('aria-hidden')).toBe('true');
  expect(screen.queryByRole('img',{name:/Fitness und Ermüdung im Tagesverlauf/})).toBeNull();
  expect(screen.queryByRole('slider',{name:'Tag im Verlauf auswählen'})).toBeNull();
  expect(screen.queryByRole('button',{name:/Persönlicher Zielbereich/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Deine Form öffnen'}));
  expect(screen.getByRole('img',{name:/Fitness und Ermüdung im Tagesverlauf/})).toBe(chart);
  const slider=screen.getByRole('slider',{name:'Tag im Verlauf auswählen'});
  fireEvent.keyDown(slider,{key:'ArrowLeft'});
  const chosen=slider.getAttribute('aria-valuenow');
  expect(screen.getAllByRole('img',{name:/Fitness und Ermüdung im Tagesverlauf/})).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Deine Form schließen'}));
  expect(screen.queryByRole('img',{name:/Fitness und Ermüdung im Tagesverlauf/})).toBeNull();
  expect(chart?.closest('[inert]')?.getAttribute('aria-hidden')).toBe('true');
  metrics.forEach((metric,index)=>expect(metric.querySelector('svg[viewBox="0 0 86 36"]')).toBe(bars[index]));
  fireEvent.click(screen.getByRole('button',{name:'Deine Form öffnen'}));
  expect(screen.getByRole('img',{name:/Fitness und Ermüdung im Tagesverlauf/})).toBe(chart);
  expect(slider.getAttribute('aria-valuenow')).toBe(chosen);
 });
});

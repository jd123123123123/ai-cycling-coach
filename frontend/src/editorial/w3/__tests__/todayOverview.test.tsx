import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { W3TodayOverviewView, type OverviewData } from '../W3TodayOverview'
import type { W3Vm } from '../W3TodayView'
import W3ReadinessSpectrum from '../W3ReadinessSpectrum'
import { readinessBand } from '../w3ReadinessBands'
import { formStory } from '../w3FormStory'
import { step, type FormPoint } from '../w3TrainingImpact'

afterEach(cleanup)
const vm = { weekDays: [{status:'today',rest:true,letter:'M'}], hasPlan:true, weekLoadLabel:'0 von 92 TSS', weekGoal:null } as W3Vm
const data: OverviewData = { form:{ctl:16.2,atl:1,tsb:15.2}, crew:null, crewState:'ready', ftp:240, ftpGoal:350 }

describe('Today overview', () => {
  it('keeps details off the quick view and opens only the requested section', () => {
    render(<W3TodayOverviewView vm={vm} data={data} week={<p>Wocheninhalt</p>} form={<p>Forminhalt</p>} crew={<p>Crewinhalt</p>} goals={<p>Zielinhalt</p>} />)
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByText('Forminhalt')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:/Deine Form/}))
    expect(screen.getByText('Forminhalt')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:/Deine Woche/}))
    expect(screen.queryByText('Forminhalt')).toBeNull()
    expect(screen.getByText('Wocheninhalt')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Details schließen'}))
    expect(screen.queryByText('Wocheninhalt')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button',{name:/Deine Woche/}))
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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CoachRead } from '../AtelierCoachRead'
import { cadenceExposure, coachEvidence, type CoachEvidence } from '../atelierCoachData'
import { ATELIER_COACH } from '../atelierCoachFixture'
import { REVIEW } from '../W3RideDetailPreview'
import { zoneTrackGeometry } from '../AtelierZoneTracks'
import { ZoneDial } from '../W3RideAtelierPreview'
import { storySVG } from '../AtelierStoryShare'

afterEach(cleanup)
const absent:CoachEvidence={debrief:null,streams:null,samples:[],ftpAtRide:null}
describe('Coach evidence and decisions',()=>{
  it('uses both halves and preserves the server drift sign convention',()=>{
    const result=coachEvidence(ATELIER_COACH,REVIEW)
    expect(result.split).toBeCloseTo((235/247-1)*100)
    expect(result.wattsDelta).toBe(-12)
    expect(result.cardiacRead).toContain('Später weniger Leistung pro Herzschlag')
    expect(result.cardiacRead).toContain('kein isolierter Ausdauertest')
    expect(result.loadDelta).toBe(172)
  })
  it('withholds unsaved plan comparisons and absent sensor conclusions',()=>{
    const result=coachEvidence(absent,{...REVIEW,planned_title:null})
    expect(result.loadDelta).toBeNull()
    expect(result.split).toBeNull()
    expect(result.stamina).toBeNull()
    expect(result.sources.every(s=>!s.available)).toBe(true)
    expect(result.best).toBeUndefined()
    expect(result.headline).not.toMatch(/Mehr Reiz|Erholung|Leistung gehalten/)
  })
  it('does not turn zero baseline or a missing earlier measurement into an improvement',()=>{
    const source={...ATELIER_COACH,debrief:{...ATELIER_COACH.debrief!,efforts:ATELIER_COACH.debrief!.efforts.map(e=>({...e,best_watts:0}))}}
    expect(coachEvidence(source,REVIEW).best).toBeUndefined()
  })
  it('weights cadence by seconds and separates coasting from missing data',()=>{
    const row=ATELIER_COACH.samples[0]
    const result=cadenceExposure([0,10,30,50,60].map((seconds,i)=>({...row,seconds,cadence:[60,80,0,null,100][i]})))
    expect(result.bands).toEqual([10,20,0])
    expect(result.pedalling).toBe(30)
    expect(result.coverage).toBeCloseTo(50/60)
  })
  it('opens evidence rather than repeating zone totals, and preserves pending plan status',()=>{
    const onPlan=vi.fn()
    render(<CoachRead review={{...REVIEW,adaptation:{state:'pending',automatic:true,reason:'Wird geprüft'}}} data={ATELIER_COACH} onPlan={onPlan} onFTP={()=>{}}/>)
    fireEvent.click(screen.getByRole('button',{name:'Körper'}))
    expect(screen.getByText(/Bei dieser wechselhaften Fahrt/)).toBeTruthy()
    expect(screen.getByText('98 → 24 %')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Planfolge'}))
    expect(screen.getByText(/Vorgeschlagene Anpassung/)).toBeTruthy()
    expect(screen.queryByText(/Im Plan angepasst/)).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:/Planvergleich öffnen/}))
    expect(onPlan).toHaveBeenCalledOnce()
  })
  it('keeps fueling model distinct from logged intake',()=>{
    render(<CoachRead review={REVIEW} data={ATELIER_COACH} onPlan={()=>{}} onFTP={()=>{}}/>)
    fireEvent.click(screen.getByRole('button',{name:'Energie'}))
    expect(screen.getByText(/tatsächliche Zufuhr ist unbekannt/)).toBeTruthy()
    expect(screen.getByText('Kohlenhydrate · Modellbereich')).toBeTruthy()
  })
  it('renders every chapter with absent Garmin streams without invented values',()=>{
    render(<CoachRead review={{...REVIEW,planned_title:null,changes:[]}} data={absent} onPlan={()=>{}} onFTP={()=>{}}/>)
    for(const chapter of ['Pacing','Körper','Technik','Berge','Energie','Entwicklung','Planfolge']){
      fireEvent.click(screen.getByRole('button',{name:chapter}))
      expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined|Dehydrierung erkannt|FTP gestiegen/)
    }
  })
})
describe('zone recommendation in the graphic',()=>{
  it('uses equal angular units and starts even when the recommendation is longer',()=>{
    const parts=zoneTrackGeometry([60,120],[180,30])
    expect(parts[0].actual).toBe(20)
    expect(parts[0].planned).toBe(60)
    expect(parts[1].start).toBe(60)
    expect(parts[1].actual).toBe(40)
    expect(parts[1].planned).toBe(10)
  })
  it('preserves unknown values and actual zeros',()=>{
    const parts=zoneTrackGeometry([0,null,60],[30,40,null])
    expect(parts[0].actual).toBe(0)
    expect(parts[1].actual).toBeNull()
    expect(parts[2].planned).toBeNull()
    expect(zoneTrackGeometry([0],[0])[0]).toEqual({start:0,actual:0,planned:0})
  })
  it('renders both aligned arcs and removes the reference when no recommendation was saved',()=>{
    const {container,rerender}=render(<ZoneDial review={REVIEW}/>)
    const a=container.querySelector('[data-zone="1"][data-track="actual"]')!,p=container.querySelector('[data-zone="1"][data-track="planned"]')!
    expect(a.getAttribute('stroke-dashoffset')).toBe(p.getAttribute('stroke-dashoffset'))
    expect(parseFloat(p.getAttribute('stroke-dasharray')!)/parseFloat(a.getAttribute('stroke-dasharray')!)).toBeCloseTo(180/105)
    rerender(<ZoneDial review={{...REVIEW,planned_title:null}}/>)
    expect(container.querySelector('[data-track="planned"]')).toBeNull()
    expect(screen.queryByText('Empfohlen')).toBeNull()
  })
  it('exports the same dual ring and identifies both tracks',()=>{
    const svg=storySVG({title:'Tempo',eyebrow:'Zonen',date:'21.09.2026',value:'60',unit:'min',caption:'Zeit in der Zone',demo:true,facts:[],zoneRing:{seconds:[60,120],planned:[180,30],selected:1}})
    expect(svg).toContain('data-track="planned"')
    expect(svg).toContain('Empfohlen')
    expect(svg).toContain('Gefahren')
  })
})

describe('fixed-screen coach explanations',()=>{
  it('pages long explanations without growing the ride, and closes with Escape',()=>{
    render(<CoachRead review={REVIEW} data={ATELIER_COACH} onPlan={()=>{}} onFTP={()=>{}}/>)
    fireEvent.click(screen.getByRole('button',{name:'Körper'}))
    fireEvent.click(screen.getByRole('button',{name:'Was bedeutet das?'}))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Positive Drift bedeutet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Nächste Erklärung'}))
    expect(screen.queryByText(/Positive Drift bedeutet/)).toBeNull()
    expect(screen.getByText(/Stamina ist Garmins Modell/)).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'})
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('switches technique graphics instead of vertically stacking more charts',()=>{
    render(<CoachRead review={REVIEW} data={ATELIER_COACH} onPlan={()=>{}} onFTP={()=>{}}/>)
    fireEvent.click(screen.getByRole('button',{name:'Technik'}))
    expect(screen.getByText('70–95 rpm')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Kraftverteilung'}))
    expect(screen.queryByText('70–95 rpm')).toBeNull()
    expect(screen.getByText('Hohe Kraft · hohe Kadenz')).toBeTruthy()
  })
})

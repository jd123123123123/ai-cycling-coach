import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ATELIER_RANKS, PlanConsequence, routeSilhouette, ZoneDial } from '../W3RideAtelierPreview'
import { REVIEW } from '../W3RideDetailPreview'

vi.mock('motion/react', async original => ({
  ...await original<typeof import('motion/react')>(),
  useReducedMotion: () => true,
}))
afterEach(cleanup)

describe('Atelier evidence and navigation', () => {
  it('keeps north up and never invents a route for absent GPS', () => {
    expect(routeSilhouette([])).toBe('')
    const coordinates = routeSilhouette([[45, 7], [46, 7], [46, 8]]).match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    expect(coordinates[3]).toBeLessThan(coordinates[1])
    expect(coordinates[4]).toBeGreaterThan(coordinates[2])
    expect(routeSilhouette([[45, 7], [45, 7]])).not.toMatch(/NaN|Infinity/)
  })
  it('lets a rider inspect actual zone minutes and stored recommended minutes', () => {
    render(<ZoneDial review={REVIEW}/>)
    expect(screen.getByRole('img', {name: /Ausdauer: 105 Minuten, 37 Prozent/})).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name:'Zone 5: VO₂-Bereich'}))
    expect(screen.getByRole('img', {name: /VO₂-Bereich: 12 Minuten, 4 Prozent/})).toBeTruthy()
    expect(screen.getByText('0 min')).toBeTruthy()
  })
  it('withholds comparisons without a saved recommendation', () => {
    render(<ZoneDial review={{...REVIEW, planned_title:null}}/>)
    expect(screen.queryByText(/waren empfohlen/)).toBeNull()
  })
  it('shows missing zones without a fabricated dial', () => {
    render(<ZoneDial review={{...REVIEW,zones:[]}}/>)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Keine Leistungsbereiche aufgezeichnet.')).toBeTruthy()
  })
  it('makes the recorded comparison and reason for the next session immediately visible', () => {
    render(<PlanConsequence review={REVIEW} rideDate="2026-08-12"/>)
    expect(screen.getByRole('heading', {name:'Länger als geplant.'})).toBeTruthy()
    expect(screen.getByText('+172 TSS')).toBeTruthy()
    expect(screen.getByText('+45 min')).toBeTruthy()
    expect(screen.getByText(REVIEW.changes[0].reason).closest('details')).toBeNull()
    expect(screen.getByText('Automatisch angepasst')).toBeTruthy()
    expect(screen.getByText('Tempo · 60 min').tagName).toBe('DEL')
  })
  it('never presents a pending adaptation as already applied', () => {
    render(<PlanConsequence review={{...REVIEW,adaptation:{state:'pending',automatic:true,reason:'Wird geprüft'}}} rideDate="2026-09-21"/>)
    expect(screen.queryByText('Automatisch angepasst')).toBeNull()
    expect(screen.getByText('Vorgeschlagene Anpassung')).toBeTruthy()
  })
  it('does not use stale planned numbers when the recommendation is absent', () => {
    render(<PlanConsequence review={{...REVIEW,planned_title:null}} rideDate="2026-09-21"/>)
    expect(screen.queryByText('+172 TSS')).toBeNull()
    expect(screen.queryByText('Plan')).toBeNull()
    expect(screen.getByText('Keine Empfehlung gespeichert')).toBeTruthy()
  })
  it('covers best-effort durations from one second to twenty minutes',()=>{
    expect(ATELIER_RANKS.map(r=>r.durationSeconds)).toEqual([1,5,10,15,30,60,120,180,300,600,1200])
  })
  it('makes the selected zone difference explicit without calling extra load a gain',()=>{
    render(<ZoneDial review={REVIEW}/>)
    expect(screen.getByText('-75 min')).toBeTruthy()
    expect(screen.getByText('weniger als geplant')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Zone 3: Tempo'}))
    expect(screen.getByText('+30 min')).toBeTruthy()
    expect(screen.getByText('mehr als geplant')).toBeTruthy()
  })
  it('does not turn a missing actual zone value into zero or a negative difference',()=>{
    render(<ZoneDial review={{...REVIEW,zones:REVIEW.zones.map((z,i)=>i===2?{...z,actual_seconds:null}:z)}}/>)
    fireEvent.click(screen.getByRole('button',{name:'Zone 3: Tempo'}))
    expect(screen.getByRole('img',{name:'Tempo: keine Messung'})).toBeTruthy()
    expect(screen.queryByText('-30 min')).toBeNull()
  })
  it('does not reuse current-sounding advice on a historical ride', () => {
    render(<PlanConsequence review={{...REVIEW,changes:[],adaptation:{state:'unchanged',automatic:true,reason:'Morgen locker fahren.'}}} rideDate="2020-01-01"/>)
    expect(screen.queryByText('Morgen locker fahren.')).toBeNull()
    expect(screen.getByText('Keine Änderung dieser Fahrt zugeordnet.')).toBeTruthy()
  })
})

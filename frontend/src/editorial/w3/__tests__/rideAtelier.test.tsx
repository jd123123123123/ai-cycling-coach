import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PlanConsequence, routeSilhouette, ZoneDial } from '../W3RideAtelierPreview'
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
  it('attributes the measured difference and keeps the reason behind disclosure', () => {
    render(<PlanConsequence review={REVIEW} rideDate="2026-08-12"/>)
    expect(screen.getByRole('heading', {name:/\+172 TSS\s+zum Plan\./})).toBeTruthy()
    expect(screen.getByText('Warum wurde angepasst?').closest('details')?.open).toBe(false)
    expect(screen.getByText('Tempo · 60 min').tagName).toBe('DEL')
  })
  it('does not reuse current-sounding advice on a historical ride', () => {
    render(<PlanConsequence review={{...REVIEW,changes:[],adaptation:{state:'unchanged',automatic:true,reason:'Morgen locker fahren.'}}} rideDate="2020-01-01"/>)
    expect(screen.queryByText('Morgen locker fahren.')).toBeNull()
    expect(screen.getByText('Keine Änderung dieser Fahrt zugeordnet.')).toBeTruthy()
  })
})

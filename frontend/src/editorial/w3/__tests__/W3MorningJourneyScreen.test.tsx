import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import JourneyScreen, { morningNightInsight } from '../W3MorningJourneyScreen'
import { MORNING_JOURNEYS, morningJourneyIndex } from '../w3MorningDestinations'
import type { MorningBriefing } from '../useMorningBriefing'
const fixture: MorningBriefing = {
  greeting:'Guten Morgen, Jannis', welcome:'12 Tage am Stück.', dateLabel:null,
  headline:'Grundlage', headlineMeta:'60 min', tone:'easy',
  blocks:[{label:'Einfahren',minutes:10,watts:100},{label:'Grundlage',minutes:50,watts:160}],
  why:null,readiness:null,heroImage:null,celebration:null,night:null,body:null,readinessVerdict:null,
  contributors:[{key:'sleep',label:'Schlaf',value:'6:40 h',sentence:'Etwas kurz',at:.67,band:{lo:.7,hi:.9},bandLabel:'7–9 h',tone:'flat',dir:'flat'}, {key:'hrv',label:'HRV',value:'61 ms',sentence:'Persönlicher Vergleich noch offen',at:null,band:null,bandLabel:null,tone:'flat',dir:'flat'}],
  window:{label:'10:00–12:00',detail:'',verdict:null,bestFrom:10,bestTo:11,hours:[{hour:10,q:.8,rideable:true,rain:0,temp:21,wind:2,dir:'W'},{hour:11,q:null,rideable:true,rain:null,temp:null,wind:null,dir:null}]},streak:null,bare:false,
}
const draw=(briefing=fixture,onClose=vi.fn(),onToday=vi.fn())=>render(<MemoryRouter><JourneyScreen briefing={briefing} onClose={onClose} onToday={onToday}/></MemoryRouter>)
beforeEach(()=>{localStorage.clear();vi.stubGlobal('ResizeObserver',class { observe(){} disconnect(){} })})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('morning journeys',()=>{
 it('keeps night and today visible together without manufacturing readiness or a personal baseline',()=>{
  draw();expect(screen.getByText('6:40 h')).toBeTruthy();expect(screen.getByRole('heading',{name:'Schön, dass du da bist.'})).toBeTruthy();expect(screen.getByText('Grundlage')).toBeTruthy();expect(screen.getByText('10–12 Uhr')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:/HRV61 ms/}));expect(screen.getByText('Dein persönlicher Vergleich ist noch offen.')).toBeTruthy()
 })
 it('prioritizes an unusual reading over cheerful copy and never uses a streak as a night insight',()=>{
  expect(morningNightInsight(fixture)).toBe('Etwas kurz')
  expect(morningNightInsight({...fixture,contributors:[...fixture.contributors,{...fixture.contributors[1],tone:'warn',sentence:'HRV unter deinem Bereich'}]})).toBe('HRV unter deinem Bereich')
  expect(morningNightInsight({...fixture,contributors:[]})).toBe('Deine Nachtwerte stehen noch aus.')
 })
 it('does not invite a ride or show leftover workout blocks on a rest day',()=>{
  draw({...fixture,tone:'rest',headline:'Ruhetag'});expect(screen.getByText('Die nächste Runde kann warten.')).toBeTruthy();expect(screen.queryByText('10:00–12:00')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:/Ruhetag.*Training im Detail/}));expect(screen.getByText('Die Berge laufen nicht weg.')).toBeTruthy();expect(screen.queryByRole('button',{name:/Einfahren, /})).toBeNull()
 })
 it('offers exactly three rider motifs and retains the selection locally',()=>{
  draw();const motifs=screen.getAllByRole('button',{name:/als Morgenmotiv ansehen/});expect(motifs).toHaveLength(3);fireEvent.click(motifs[1]);expect(localStorage.getItem('ridr.morning.selected-place.v1')).toBe(MORNING_JOURNEYS[1].id)
  fireEvent.click(screen.getByRole('button',{name:'Ort und Bildnachweis'}));expect(screen.getAllByRole('button',{name:/als Morgenmotiv ansehen/})).toHaveLength(3)
 })
 it('tolerates invalid stored selection and denied storage',()=>{
  localStorage.setItem('ridr.morning.selected-place.v1','removed-place');vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied')});draw();fireEvent.click(screen.getAllByRole('button',{name:/als Morgenmotiv ansehen/})[2]);expect(screen.getByRole('button',{name:MORNING_JOURNEYS[2].name+' als Morgenmotiv ansehen'}).getAttribute('aria-pressed')).toBe('true')
 })
 it('keeps forecast gaps unknown and supports workout interaction',()=>{
  draw();fireEvent.click(screen.getByRole('button',{name:/Grundlage.*Training im Detail/}));fireEvent.click(screen.getByRole('button',{name:'Grundlage, 50 Minuten, 160 Watt'}));expect(screen.getByText('50 min · 160 W')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'11Uhr'}));expect(screen.getAllByText('—')).toHaveLength(3)
 })
 it('labels HRV percentage and pulse bpm against the personal baseline',()=>{
  draw({...fixture,night:{totalLabel:'6:40 h',stages:[],hrv:{value:'61 ms',delta:4,position:'above'},rhr:{value:'46 bpm',delta:-2,position:'below'},battery:null}})
  expect(screen.getByText('+4 % zur Basis')).toBeTruthy();expect(screen.getByText('-2 bpm zur Basis')).toBeTruthy()
 })
 it('does not call an absent plan a planned day',()=>{
  draw({...fixture,tone:'unknown',headline:'Noch kein Plan',blocks:[]});expect(screen.queryByText('Heute im Plan')).toBeNull();expect(screen.getByText('Noch kein Plan')).toBeTruthy()
 })
 it('keeps the compact weather summary bound to its full window after selecting another hour',()=>{
  const weather={...fixture.window!,hours:[{hour:10,q:.8,rideable:true,rain:0,temp:21,wind:2,dir:'W'},{hour:11,q:.7,rideable:true,rain:30,temp:23,wind:9,dir:'W'}]}
  draw({...fixture,window:weather});const initial=screen.getByRole('button',{name:'Wetter und Fahrzeit im Detail'}).textContent
  expect(initial).toContain('21–23°');expect(initial).toContain('30%');expect(initial).toContain('9 km/h')
  fireEvent.click(screen.getByRole('button',{name:'Wetter und Fahrzeit im Detail'}));fireEvent.click(screen.getByRole('button',{name:'11Uhr'}));fireEvent.click(screen.getByRole('button',{name:'Zurück zum Morgen'}));expect(screen.getByRole('button',{name:'Wetter und Fahrzeit im Detail'}).textContent).toBe(initial)
 })
 it('closes details first with Escape and preserves today and dismissal',()=>{
  const close=vi.fn(),today=vi.fn();draw(fixture,close,today);fireEvent.click(screen.getByRole('button',{name:'Ort und Bildnachweis'}));fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(close).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Nacht und Bereitschaft im Detail'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Mein Tag'}));expect(today).toHaveBeenCalledOnce();fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(close).toHaveBeenCalledOnce()
 })
 it('rotates by calendar day, not refresh time, with a licensed source for each unique destination',()=>{
  expect(morningJourneyIndex(new Date(2026,8,13,6))).toBe(morningJourneyIndex(new Date(2026,8,13,11)))
  expect(morningJourneyIndex(new Date(2026,8,14,6))).toBe((morningJourneyIndex(new Date(2026,8,13,6))+1)%3)
  expect(new Set(MORNING_JOURNEYS.map(j=>j.id)).size).toBe(3)
  MORNING_JOURNEYS.forEach(j=>{expect(j.source).toMatch(/^https:\/\/(unsplash.com|www.pexels.com)\//);expect(j.licenseUrl).toMatch(/^https?:\/\//);expect(j.author.length).toBeGreaterThan(0)})
 })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ftpWindow, rideMean, ridePlot } from '../atelierRideData'
import { ATELIER_SAMPLES, ATELIER_FTP } from '../atelierRideFixture'
import { AtelierRideAnalysis } from '../AtelierRideAnalysis'
import { storySVG, type RideStory } from '../AtelierStoryShare'
import W3RideBestEfforts from '../W3RideBestEfforts'
import { FIXTURE } from '../W3RideDetailPreview'
afterEach(cleanup)

describe('linked ride analysis',()=>{
 it('weights irregular intervals and excludes missing values without turning them into zeros',()=>{
  const samples=[{...ATELIER_SAMPLES[0],seconds:0,power:100},{...ATELIER_SAMPLES[1],seconds:10,power:300},{...ATELIER_SAMPLES[2],seconds:40,power:null},{...ATELIER_SAMPLES[3],seconds:70,power:200}]
  expect(rideMean(samples,'power')).toBe(250)
  expect(ridePlot(samples,'power',2,280).series[0].points[2]).toBeNull()
  expect(ridePlot(samples,'power',2,280).marker).toBeUndefined()
 })
 it('filters FTP by calendar date and excludes future data from a historical view',()=>{
  const entries=ftpWindow(ATELIER_FTP,30,'2026-08-15')
  expect(entries.map(e=>e.date)).toEqual(['2026-07-20','2026-08-10'])
  expect(ftpWindow(ATELIER_FTP,30,'2020-01-01')).toEqual([])
 })
 it('shows the same selected sample across power, pulse and cadence',()=>{
  const selected=20,sample=ATELIER_SAMPLES[selected],onSelect=vi.fn()
  render(<AtelierRideAnalysis samples={ATELIER_SAMPLES} metric="heart_rate" selected={selected} ftp={280} onSelect={onSelect} onMetric={()=>{}}/>)
  expect(screen.getAllByText(String(sample.heart_rate))).toHaveLength(2)
  expect(screen.getByText(String(sample.power))).toBeTruthy()
  fireEvent.change(screen.getByRole('slider'),{target:{value:'30'}})
  expect(onSelect).toHaveBeenCalledWith(30)
 })
 it('has no FTP reference without a known FTP',()=>{
  expect(ridePlot(ATELIER_SAMPLES,'power',null,null).reference).toBeUndefined()
 })
 it('uses heart-rate bands only with a known reference, and grade colours only for elevation',()=>{
  expect(ridePlot(ATELIER_SAMPLES,'heart_rate',null,280).bands).toBeUndefined()
  expect(ridePlot(ATELIER_SAMPLES,'heart_rate',null,280,190).bands).toHaveLength(5)
  expect(ridePlot(ATELIER_SAMPLES,'altitude',null,280).timeColors).toHaveLength(ATELIER_SAMPLES.length)
 })
 it('updates the controlled best-effort duration for matching exports',()=>{
  const onSelect=vi.fn()
  render(<W3RideBestEfforts ranks={FIXTURE.ranks} selectedDuration={60} onSelectDuration={onSelect}/>)
  expect(screen.getByRole('img',{name:/1 MIN: 598 Watt/})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'5 min'}))
  expect(onSelect).toHaveBeenCalledWith(300)
 })
})

describe('shareable evidence',()=>{
 const story:RideStory={title:'A <script>ride</script>',eyebrow:'Fahrt',value:'138,6',unit:'km',date:'21.09.2026',caption:'Dein Höhenprofil',demo:true,routePath:'M42,43 L99,100',facts:[{label:'Fahrzeit',value:'4:45'}],plot:ridePlot(ATELIER_SAMPLES,'altitude',null,null)}
 it('exports an escaped SVG poster with a demo mark and no default GPS route',()=>{
  const svg=storySVG(story)
  expect(svg).toContain('height="1350"')
  expect(svg).toContain('BEISPIELDATEN')
  expect(svg).not.toContain('<script>')
  expect(svg).not.toContain(story.routePath)
  expect(svg).not.toContain('<button')
  expect(svg).not.toContain('<foreignObject')
 })
 it('uses 9:16 dimensions and adds the route only when selected',()=>{
  const svg=storySVG(story,true,true)
  expect(svg).toContain('height="1920"')
  expect(svg).toContain(story.routePath)
 })
})

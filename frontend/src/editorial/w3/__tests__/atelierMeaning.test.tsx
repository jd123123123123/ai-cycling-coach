import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ATELIER_CONTRIBUTIONS, contributionAfter, contributionValue, RideContributionView, RouteElevation, trainingEmphasis, planComparisonPlot, contributionHistory } from '../AtelierRideMeaning'
import { ATELIER_SAMPLES } from '../atelierRideData'
import { REVIEW } from '../W3RideDetailPreview'
import { storySVG, type RideStory } from '../AtelierStoryShare'

afterEach(cleanup)
describe('ride purpose and contribution', () => {
  it('uses recorded dose for the training emphasis and does not invent a gain', () => {
    expect(trainingEmphasis(REVIEW.zones).title).toBe('Ausdauer & Tempo')
    expect(trainingEmphasis(REVIEW.zones).total).toBe(285 * 60)
    expect(trainingEmphasis([]).title).toBe('Trainingsreiz noch offen')
    expect(trainingEmphasis([{label:'Erholung',actual_seconds:300,planned_seconds:null}]).title).toBe('Locker gefahren')
  })
  it('adds the ride once to the preceding totals, preserving units and missing baselines', () => {
    const [distance, time, ascent] = ATELIER_CONTRIBUTIONS.metrics
    expect(contributionAfter(distance)).toBe(4812)
    expect(contributionValue(contributionAfter(time), 'time')).toBe('165:00')
    expect(contributionAfter(ascent)).toBe(41260)
    expect(contributionAfter({...distance,before:null})).toBeNull()
    expect(contributionAfter({...distance,added:null})).toBeNull()
    expect(contributionAfter({...distance,before:-2})).toBeNull()
    expect(contributionAfter({...distance,before:0})).toBe(138.6)
    expect(contributionValue(3599,'time')).toBe('1:00')
  })
  it('compares the whole period honestly and lets riders select saddle time', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<RideContributionView data={ATELIER_CONTRIBUTIONS} selected="distance" onSelect={onSelect}/>)
    expect(screen.getByRole('img',{name:'2,9 Prozent deines bisherigen Jahresstands stammen aus dieser Fahrt'})).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Sattelzeit ansehen'}))
    expect(onSelect).toHaveBeenCalledWith('time')
    rerender(<RideContributionView data={ATELIER_CONTRIBUTIONS} selected="time" onSelect={onSelect}/>)
    expect(screen.getByRole('img',{name:'2,9 Prozent deines bisherigen Jahresstands stammen aus dieser Fahrt'})).toBeTruthy()
    expect(screen.getAllByText('+4:45').length).toBeGreaterThan(0)
  })
  it('shows an addition without fabricating a previous total or share', () => {
    render(<RideContributionView data={{period:'Dein Jahr',metrics:[{...ATELIER_CONTRIBUTIONS.metrics[0],before:null}]}} selected="distance" onSelect={()=>{}}/>)
    expect(screen.getByRole('img',{name:'Kein früherer Jahresstand verfügbar'})).toBeTruthy()
    expect(screen.getByText('Bisheriger Stand fehlt')).toBeTruthy()
  })
  it('labels height and distance axes and opens the height analysis', () => {
    const onOpen=vi.fn()
    render(<RouteElevation samples={ATELIER_SAMPLES} onOpen={onOpen}/>)
    expect(screen.getByRole('img',{name:/Metern über 138,6 Kilometer/})).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:/Detaillierte Höhenanalyse öffnen/}))
    expect(onOpen).toHaveBeenCalledOnce()
  })
  it('keeps missing altitude gaps and does not draw a made-up flat route', () => {
    const samples=ATELIER_SAMPLES.slice(0,3).map((s,i)=>({...s,altitude:i===1?null:s.altitude}))
    const { container,rerender }=render(<RouteElevation samples={samples} onOpen={()=>{}}/>)
    expect(container.querySelector('path[stroke-width="1.3"]')?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    rerender(<RouteElevation samples={[]} onOpen={()=>{}}/>)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Kein Höhenverlauf aufgezeichnet.')).toBeTruthy()
  })
  it('preserves the demo ascent total when the illustrative terrain changes', () => {
    const ascent=ATELIER_SAMPLES.slice(1).reduce((sum,s,i)=>sum+Math.max(0,s.altitude!-ATELIER_SAMPLES[i].altitude!),0)
    expect(ascent).toBeCloseTo(5639,6)
    expect(ATELIER_SAMPLES.at(-1)?.seconds).toBeCloseTo(285*60,6)
  })
  it('keeps calendar history period-matched and adds the current ride only once',()=>{
    const source={...ATELIER_CONTRIBUTIONS,history:[...ATELIER_CONTRIBUTIONS.history!,{date:'2026-10-01',totals:{distance:99000,time:99000,ascent:99000}}]}
    const history=contributionHistory(source,'distance')
    expect(history.at(-2)?.value).toBe(4673.4)
    expect(history.at(-1)?.value).toBe(4812)
    expect(history.filter(p=>p.date==='2026-09-21')).toHaveLength(1)
    expect(history.some(p=>p.value===99000)).toBe(false)
    expect(contributionHistory({...source,history:[]},'distance')).toEqual([])
  })
  it('compares recorded power with the stored plan and preserves missing references',()=>{
    const model=planComparisonPlot(REVIEW,ATELIER_SAMPLES,280)!
    expect(model.unit).toBe('% FTP')
    expect(model.series[0].points[0]?.y).toBeCloseTo(ATELIER_SAMPLES[0].power!/280*100)
    expect(model.series[1].points.at(-1)).toBeNull()
    expect(planComparisonPlot({...REVIEW,planned_title:null},ATELIER_SAMPLES,280)?.series[1].points).toEqual([])
    expect(planComparisonPlot({...REVIEW,trace:[]})).toBeNull()
  })
  it('exports year totals with before/after labels and explicit demo attribution', () => {
    const story:RideStory={title:'Diese Fahrt zählt.',eyebrow:'Dein Jahr 2026',value:'+138,6',unit:'km',date:'21.09.2026',caption:'Kilometer dazu',facts:[],demo:true,contribution:{before:'4.673,4',after:'4.812',unit:'km',share:138.6/4812}}
    const svg=storySVG(story)
    expect(svg).toContain('Vorher')
    expect(svg).toContain('Jetzt')
    expect(svg).toContain('4.673,4')
    expect(svg).toContain('4.812')
    expect(svg).toContain('2,9 %')
    expect(svg).toContain('BEISPIELDATEN')
  })
})

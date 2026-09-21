import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import W3TrainingReview, { reviewComparison, reviewTracePoints } from '../W3TrainingReview'
import type { TrainingReview } from '../../../api/trainingReview'

// Motion should not make assertions depend on animation-frame timing.
vi.mock('motion/react', async original => ({
  ...await original<typeof import('motion/react')>(),
  useReducedMotion: () => true,
}))
afterEach(cleanup)

const review: TrainingReview = {
  version: '1', activity_id: 1, headline: 'Deinen Reiz getroffen.', summary: 'Passt zur Empfehlung.',
  score: 100, score_label: 'Planpassung', status: 'matched', planned_title: 'VO₂', actual_title: 'Fahrt',
  coverage: 1, stimulus: 'VO₂-Bereich', stimulus_detail: '12 Minuten im VO₂-Leistungsbereich.',
  pairs: [{ label: 'Belastung', actual: 40, planned: 40, unit: 'TSS' }], zones: [], trace: [],
  impact: [{ day: 0, fitness: 1, fatigue: 6, form: -5 }, { day: 1, fitness: .98, fatigue: 5.14, form: -4.16 }],
  impact_basis: 'Abweichung vom Plan.', changes: [], action: 'Jetzt erholen.', limitations: [], method: 'Produktheuristik.',
}
const detailed: TrainingReview = {
  ...review,
  pairs: [{ label: 'Dauer', actual: 3, planned: 3, unit: 'min' }, ...review.pairs],
  trace: [{ at_s: 0, actual_pct: 50, planned_pct: 55 }, { at_s: 60, actual_pct: 114, planned_pct: 115 }, { at_s: 120, actual_pct: 0, planned_pct: 50 }],
  zones: [{ label: 'Erholung', actual_seconds: 60, planned_seconds: 60 }, { label: 'VO₂-Bereich', actual_seconds: 120, planned_seconds: 120 }],
}
const openMethod = () => fireEvent.click(screen.getByText('Einordnung & Datengrundlage'))
const overlay = () => screen.getByRole('img', { name: /gleicher Zeit- und FTP-Skala/ })
const pathCoordinates = (element: Element) => (element.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

describe('Training review actions and attribution', () => {
  it('keeps the available action visible while the model explanation stays optional', () => {
    render(<W3TrainingReview review={review} />)
    expect(screen.getByText('Modellierte Planabweichung').closest('details')?.open).toBe(false)
    expect(screen.getByText('Jetzt erholen.')).toBeTruthy()
    fireEvent.click(screen.getByText('Modellierte Planabweichung'))
    expect(screen.getByText('-5')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+1' }))
    expect(screen.getByText('-4,2')).toBeTruthy()
    expect(screen.getByText('1 Tag danach')).toBeTruthy()
  })

  it('withholds absent score and model evidence while opening the real plan', () => {
    const onOpenPlan = vi.fn()
    render(<W3TrainingReview review={{ ...review, score: null, coverage: null, impact: [] }} onOpenPlan={onOpenPlan} />)
    openMethod()
    expect(screen.queryByRole('img', { name: /Planpassung/ })).toBeNull()
    expect(screen.queryByText('Modellierte Planabweichung')).toBeNull()
    expect(screen.getByText('Empfehlung gespeichert · Vergleich noch nicht gesichert')).toBeTruthy()
    expect(screen.getByText(/Keine Leistungsmessung/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Trainingsplan öffnen' }))
    expect(onOpenPlan).toHaveBeenCalledTimes(1)
  })

  it('shows an attributed before/after change and retains further changes in its explanation', () => {
    render(<W3TrainingReview review={{ ...review, changes: [
      { date: '2026-09-10', before: 'Schwelle', after: 'Erholung', reason: 'Zusätzliche Belastung' },
      { date: '2026-09-11', before: 'VO₂', after: 'Ausdauer', reason: 'Mehr Erholungszeit' },
    ] }} />)
    expect(screen.getByText('Plan angepasst')).toBeTruthy()
    expect(screen.getByText('Schwelle').tagName).toBe('DEL')
    expect(screen.getByText('Erholung')).toBeTruthy()
    const why = screen.getByText('Warum diese Änderung?').closest('details')!
    expect(why.open).toBe(false)
    fireEvent.click(screen.getByText('Warum diese Änderung?'))
    expect(within(why).getByText('Zusätzliche Belastung')).toBeTruthy()
    expect(within(why).getByText(/2026-09-11: VO₂ → Ausdauer.*Mehr Erholungszeit/)).toBeTruthy()
  })

  it.each(['adapted', 'unchanged', 'protected'] as const)('shows a persisted %s decision without asking for manual application', state => {
    const reason = state === 'protected' ? 'Deine selbst gewählten Einheiten bleiben geschützt.' : state === 'unchanged' ? 'Die verbleibende Woche passt weiterhin.' : 'Die zusätzliche Belastung ist ausgeglichen.'
    render(<W3TrainingReview review={{ ...review, adaptation: { state, reason, automatic: true } }} />)
    expect(screen.getByText(reason)).toBeTruthy()
    expect(screen.getAllByLabelText('Automatisch berücksichtigt')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /anwenden|übernehmen|bestätigen/i })).toBeNull()
  })

  it.each(['pending', 'limited'] as const)('does not present a current %s decision as already applied', state => {
    render(<W3TrainingReview review={{ ...review, adaptation: { state, reason: 'Prüfung noch nicht abgeschlossen.', automatic: false } }} />)
    expect(screen.getByText(state === 'pending' ? 'Auswertung ausstehend' : 'Datengrundlage begrenzt')).toBeTruthy()
    expect(screen.queryByLabelText('Automatisch berücksichtigt')).toBeNull()
  })
})

describe('Shared actual and planned timeline', () => {
  it('draws actual and planned values on the same time and FTP axes without a series switch', () => {
    render(<W3TrainingReview review={{ ...review,
      pairs: [{ label: 'Dauer', actual: 2, planned: 1, unit: 'min' }],
      trace: [{ at_s: 0, actual_pct: 65, planned_pct: 65 }, { at_s: 60, actual_pct: 130, planned_pct: null }],
    }} />)
    const graph = overlay()
    const paths = graph.querySelectorAll('path')
    expect(paths).toHaveLength(2)
    const actual = pathCoordinates(paths[0]), plan = pathCoordinates(paths[1])
    expect(actual.slice(0, 2)).toEqual(plan.slice(0, 2)) // Equal FTP at equal time coincides.
    const actualEnd = actual.at(-2)!, planEnd = plan.at(-2)!, start = actual[0]
    expect(planEnd - start).toBeCloseTo((actualEnd - start) / 2) // One-minute plan ends halfway through two-minute ride.
    expect(actual.at(-1)).toBeLessThan(actual[1]) // 130% is above 65% on the same vertical axis.
    expect(screen.queryByRole('button', { name: 'Gefahren' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Empfohlen' })).toBeNull()
    expect(within(graph).getByText('2 min')).toBeTruthy()
  })

  it('switches to zone totals and exposes the selected actual/planned dose', () => {
    render(<W3TrainingReview review={detailed} />)
    const traceTab = screen.getByRole('button', { name: 'Verlauf' })
    const zoneTab = screen.getByRole('button', { name: 'Leistungsbereiche' })
    expect(traceTab.getAttribute('aria-pressed')).toBe('true')
    expect(overlay()).toBeTruthy()
    fireEvent.click(zoneTab)
    expect(zoneTab.getAttribute('aria-pressed')).toBe('true')
    const recovery = screen.getByRole('button', { name: 'Erholung: 1 min gefahren, 1 min empfohlen' })
    fireEvent.click(recovery)
    expect(recovery.getAttribute('aria-pressed')).toBe('true')
    const reading = screen.getByText('Erholung').parentElement!
    expect(reading.textContent).toContain('1min')
    expect(within(reading).getByText('Plan 1 min')).toBeTruthy()
    fireEvent.click(traceTab)
    expect(screen.getByRole('slider', { name: 'Abschnitt der Fahrt auswählen' })).toBeTruthy()
  })

  it('reports selected aggregated values, retaining a measured zero', () => {
    render(<W3TrainingReview review={detailed} />)
    const slider = screen.getByRole('slider', { name: 'Abschnitt der Fahrt auswählen' })
    fireEvent.change(slider, { target: { value: '60' } })
    expect(slider.getAttribute('aria-valuetext')).toBe('1:00, gefahren 114 Prozent FTP, empfohlen 115 Prozent FTP')
    expect(screen.getByText('1:00')).toBeTruthy()
    expect(screen.getByText('114 % FTP')).toBeTruthy()
    fireEvent.change(slider, { target: { value: '120' } })
    expect(slider.getAttribute('aria-valuetext')).toContain('gefahren 0 Prozent FTP')
    expect(screen.getByText('0 % FTP')).toBeTruthy()
  })

  it('scrubs irregularly spaced sections by elapsed time rather than array index', () => {
    render(<W3TrainingReview review={{ ...detailed,
      pairs: [{ label: 'Dauer', actual: 5, planned: 5, unit: 'min' }],
      trace: [{ at_s: 0, actual_pct: 50, planned_pct: 55 }, { at_s: 30, actual_pct: 80, planned_pct: 85 }, { at_s: 240, actual_pct: 110, planned_pct: 115 }],
    }} />)
    const slider = screen.getByRole('slider', { name: 'Abschnitt der Fahrt auswählen' })
    expect(slider.getAttribute('max')).toBe('300')
    fireEvent.change(slider, { target: { value: '150' } })
    expect(slider.getAttribute('aria-valuetext')).toBe('2:30, gefahren 80 Prozent FTP, empfohlen 85 Prozent FTP')
    fireEvent.change(slider, { target: { value: '240' } })
    expect(slider.getAttribute('aria-valuetext')).toBe('4:00, gefahren 110 Prozent FTP, empfohlen 115 Prozent FTP')
  })

  it('preserves visible intervals before gaps and draws the final recorded chunk', () => {
    const trace = [{ at_s: 0, actual_pct: 50, planned_pct: null }, { at_s: 60, actual_pct: null, planned_pct: null }, { at_s: 120, actual_pct: 75, planned_pct: null }]
    const points = reviewTracePoints(trace, 'actual_pct', 180)
    const runs = points.reduce<{ x: number; y: number }[][]>((all, point) => {
      if (point) all[all.length - 1].push(point)
      else if (all.at(-1)!.length) all.push([])
      return all
    }, [[]]).filter(run => run.length)
    expect(runs).toEqual([[{ x: 0, y: 50 }, { x: 60, y: 50 }], [{ x: 120, y: 75 }, { x: 180, y: 75 }]])
    render(<W3TrainingReview review={{ ...review, planned_title: null, status: 'unplanned', trace, pairs: [{ label: 'Dauer', actual: 3, planned: null, unit: 'min' }] }} />)
    const graph = screen.getByRole('img', { name: 'Gefahrene Leistung über die Zeit' })
    const path = graph.querySelector('path')!.getAttribute('d')!
    expect(path.match(/M/g)).toHaveLength(2)
    expect(path.match(/C/g)).toHaveLength(2) // Neither singleton interval disappears as an invisible move.
    const slider = screen.getByRole('slider', { name: 'Abschnitt der Fahrt auswählen' })
    fireEvent.change(slider, { target: { value: '60' } })
    expect(slider.getAttribute('aria-valuetext')).toContain('gefahren — Prozent FTP')
    expect(graph.querySelector('circle')).toBeNull()
  })

  it('ends a shorter recommendation at its own duration without filling the remaining ride', () => {
    const trace = [{ at_s: 0, actual_pct: 50, planned_pct: 65 }, { at_s: 60, actual_pct: 80, planned_pct: 65 }, { at_s: 120, actual_pct: 90, planned_pct: null }]
    const planned = reviewTracePoints(trace, 'planned_pct', 90).filter(point => point != null)
    expect(planned.at(-1)).toEqual({ x: 90, y: 65 })
    expect(planned.every(point => point.x <= 90)).toBe(true)
    expect(reviewTracePoints(trace, 'actual_pct', 180).filter(point => point != null).at(-1)).toEqual({ x: 180, y: 90 })
  })
})

describe('Plan comparison and model details', () => {
  it('shows longer duration and excess load as separate measured differences', () => {
    const data = { ...review, pairs: [{ label: 'Dauer', actual: 70, planned: 45, unit: 'min' }, { label: 'Belastung', actual: 50, planned: 40, unit: 'TSS' }] }
    expect(reviewComparison(data)).toMatchObject({ durationDelta: 25, loadDelta: 10, planned: true })
    render(<W3TrainingReview review={data} />)
    expect(screen.getByRole('heading', { name: /25 min.*länger gefahren/ })).toBeTruthy()
    expect(screen.getByText('+10 TSS')).toBeTruthy()
    const duration = screen.getByRole('img', { name: 'Dauer: 70 min gefahren, 45 min empfohlen' })
    expect(Number.parseFloat((duration.querySelector('b') as HTMLElement).style.left)).toBeCloseTo(45 / 70 * 100)
    expect((duration.querySelector('i') as HTMLElement).style.width).toBe('100%')
  })

  it('leads with load when its relative deviation is larger than the duration difference', () => {
    render(<W3TrainingReview review={{ ...review, status: 'extra', score: 45,
      pairs: [{ label: 'Dauer', actual: 46, planned: 45, unit: 'min' }, { label: 'Belastung', actual: 90, planned: 40, unit: 'TSS' }],
    }} />)
    expect(screen.getByRole('heading', { name: /\+50 TSS.*über dem Plan/ })).toBeTruthy()
    expect(screen.getByText('1 min länger')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Deinen Plan.*getroffen/ })).toBeNull()
  })

  it('keeps the heuristic score in the method disclosure rather than leading with a grade', () => {
    render(<W3TrainingReview review={review} />)
    expect(screen.getByRole('heading', { name: /Deinen Plan.*getroffen/ })).toBeTruthy()
    expect(screen.getByLabelText('100 von 100 Planpassung').closest('details')?.open).toBe(false)
    expect(screen.getByText('Einordnung & Datengrundlage').closest('details')?.open).toBe(false)
    openMethod()
    expect(screen.getByRole('img', { name: '100 von 100 Planpassung' })).toBeTruthy()
    expect(screen.getByText('Produktheuristik.')).toBeTruthy()
    expect(screen.getByText(/keine sekündlichen Rohdaten/)).toBeTruthy()
  })

  it('switches metric and day while preserving their independent selections', () => {
    render(<W3TrainingReview review={detailed} />)
    fireEvent.click(screen.getByText('Modellierte Planabweichung'))
    fireEvent.click(screen.getByRole('button', { name: /Fitness/ }))
    expect(screen.getByRole('img', { name: /Modellierte Fitnessabweichung/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+1' }))
    expect(screen.getByRole('button', { name: /Fitness/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Ermüdung/ }))
    expect(screen.getByRole('img', { name: /Modellierte Ermüdungabweichung/ })).toBeTruthy()
    expect(screen.getByText('+5,1')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+1' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('collapses zero model deviation into an on-plan indicator', () => {
    render(<W3TrainingReview review={{ ...review, impact: review.impact.map(point => ({ ...point, fitness: 0, fatigue: 0, form: 0 })) }} />)
    fireEvent.click(screen.getByText('Modellierte Planabweichung'))
    expect(screen.getByText('Belastung wie geplant')).toBeTruthy()
    expect(screen.queryByLabelText('Tag der Belastungsprognose')).toBeNull()
    expect(screen.queryByRole('img', { name: /Modellierte/ })).toBeNull()
  })
})

describe('Unplanned, limited, and historical reviews', () => {
  it('withholds all plan overlays, scores, and deltas without a saved recommendation', () => {
    const unplanned: TrainingReview = { ...detailed, planned_title: null, status: 'unplanned' }
    expect(reviewComparison(unplanned)).toMatchObject({ planned: false, durationDelta: null, loadDelta: null })
    render(<W3TrainingReview review={unplanned} />)
    expect(screen.getByText('Deine Aufzeichnung')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /2 min.*VO₂-Bereich/ })).toBeTruthy()
    expect(screen.getByText('Dein längster gemessener Leistungsbereich')).toBeTruthy()
    expect(screen.queryByText('Fahrt × Plan')).toBeNull()
    const graph = screen.getByRole('img', { name: 'Gefahrene Leistung über die Zeit' })
    expect(graph.querySelectorAll('path')).toHaveLength(1)
    expect(screen.queryByText('Modellierte Planabweichung')).toBeNull()
    expect(screen.getByRole('img', { name: 'Dauer: 3 min gefahren' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Belastung: 40 TSS gefahren' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Leistungsbereiche' }))
    expect(screen.getByRole('button', { name: 'VO₂-Bereich: 2 min gefahren' })).toBeTruthy()
    expect(screen.queryByText(/^Plan /)).toBeNull()
    openMethod()
    expect(screen.getByText('Keine gespeicherte Empfehlung für diese Fahrt')).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Planpassung/ })).toBeNull()
  })

  it('distinguishes an incomparable saved recommendation from a missing one', () => {
    render(<W3TrainingReview review={{ ...review, planned_title: 'Krafttraining', score: null, pairs: [{ label: 'Belastung', actual: 40, planned: null, unit: 'TSS' }], zones: [], trace: [], impact: [] }} />)
    openMethod()
    expect(screen.getByText('Empfehlung gespeichert · Vergleich noch nicht gesichert')).toBeTruthy()
    expect(screen.queryByText('Keine gespeicherte Empfehlung für diese Fahrt')).toBeNull()
    expect(screen.queryByText('Fahrt × Plan')).toBeNull()
    expect(screen.queryByRole('img', { name: /Planpassung/ })).toBeNull()
  })

  it('shows planned zone targets without inventing an actual trace or measured dose', () => {
    render(<W3TrainingReview review={{ ...review, score: null, status: 'limited', coverage: null, trace: [], zones: [{ label: 'Ausdauer', actual_seconds: null, planned_seconds: 1200 }] }} />)
    expect(screen.queryByRole('button', { name: 'Verlauf' })).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ausdauer: — gefahren, 20 min empfohlen' })).toBeTruthy()
    expect(screen.getByText('Plan 20 min')).toBeTruthy()
  })

  it('does not turn an old ride into recovery advice or a current-week claim', () => {
    render(<W3TrainingReview rideDate="2000-01-02T12:00:00Z" review={{ ...review, adaptation: { state: 'unchanged', automatic: true, reason: 'Die verbleibende Woche passt weiterhin.' } }} onOpenPlan={() => {}} />)
    expect(screen.getByText('Damals berücksichtigt')).toBeTruthy()
    expect(screen.getByLabelText('Automatisch berücksichtigt')).toBeTruthy()
    expect(screen.queryByText('Jetzt erholen.')).toBeNull()
    expect(screen.queryByText('Die verbleibende Woche passt weiterhin.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Trainingsplan öffnen' })).toBeTruthy()
  })

  it.each(['pending', 'limited'] as const)('never describes a historical %s check as completed', state => {
    render(<W3TrainingReview rideDate="2000-01-02T12:00:00Z" review={{ ...review, adaptation: { state, reason: 'Prüfung nicht abgeschlossen.', automatic: false } }} onOpenPlan={() => {}} />)
    expect(screen.getByText('Planprüfung zu dieser Fahrt')).toBeTruthy()
    expect(screen.getByText(state === 'pending' ? 'Auswertung ausstehend' : 'Datengrundlage begrenzt')).toBeTruthy()
    expect(screen.queryByText('Damals berücksichtigt')).toBeNull()
    expect(screen.queryByLabelText('Automatisch berücksichtigt')).toBeNull()
    expect(screen.queryByText('Jetzt erholen.')).toBeNull()
  })

  it('does not imply completed processing for a historical ride without attribution', () => {
    render(<W3TrainingReview rideDate="2000-01-02T12:00:00Z" review={review} onOpenPlan={() => {}} />)
    expect(screen.getByText('Planprüfung zu dieser Fahrt')).toBeTruthy()
    expect(screen.getByText('Keine Änderung dieser Fahrt zugeordnet.')).toBeTruthy()
    expect(screen.queryByText('Damals berücksichtigt')).toBeNull()
  })
})


describe('Timeline readout boundaries', () => {
 it('does not carry a prescribed power value beyond the prescription end', () => {
  render(<W3TrainingReview review={{...review,pairs:[{label:'Dauer',actual:3,planned:1.5,unit:'min'}],trace:[{at_s:0,actual_pct:50,planned_pct:65},{at_s:60,actual_pct:80,planned_pct:65},{at_s:120,actual_pct:90,planned_pct:null}]}}/>);
  const slider=screen.getByRole('slider',{name:'Abschnitt der Fahrt auswählen'});
  fireEvent.change(slider,{target:{value:'100'}});
  expect(slider.getAttribute('aria-valuetext')).toBe('1:40, gefahren 80 Prozent FTP, empfohlen — Prozent FTP');
 });
});

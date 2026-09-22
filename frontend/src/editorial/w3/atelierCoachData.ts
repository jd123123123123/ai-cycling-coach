import type { RaceDebrief } from '../../api/debrief'
import type { StreamAnalysis } from '../../api/streamAnalysis'
import type { TrainingReview } from '../../api/trainingReview'
import { formatValue, type RideSample } from './atelierRideData'

/** Display adapter over the existing debrief + stream-analysis endpoints.
 * No device score is reverse-engineered from averages, no missing sensor is filled. */
export interface CoachEvidence {
  debrief: RaceDebrief | null
  streams: StreamAnalysis | null
  samples: RideSample[]
  ftpAtRide: number | null
}
export type CoachChapter = 'Fazit' | 'Pacing' | 'Körper' | 'Technik' | 'Berge' | 'Energie' | 'Entwicklung' | 'Planfolge'
export const COACH_CHAPTERS: CoachChapter[] = ['Fazit','Pacing','Körper','Technik','Berge','Energie','Entwicklung','Planfolge']
export const known = (v: number | null | undefined): v is number => v != null && Number.isFinite(v)
export const signed = (v: number | null | undefined, digits = 0) => known(v) ? `${v > 0 ? '+' : ''}${formatValue(v, digits)}` : '—'

export function coachEvidence(data: CoachEvidence, review: TrainingReview) {
  const d = data.debrief, p = d?.pacing, e = d?.efficiency, bike = data.streams?.bike_dynamics
  const load = review.pairs.find(p => p.unit === 'TSS')
  const loadDelta = review.planned_title && known(load?.actual) && known(load?.planned) ? load.actual - load.planned : null
  const split = known(p?.first_half_np) && known(p?.second_half_np) && p.first_half_np > 0 ? (p.second_half_np / p.first_half_np - 1) * 100 : null
  const wattsDelta = known(p?.first_half_np) && known(p?.second_half_np) ? p.second_half_np - p.first_half_np : null
  const drift = e?.decoupling_pct
  const mixedTerrain = (d?.header.elevation_m ?? 0) > 500 || (p?.variability_index ?? 0) > 1.1
  const peaks = (d?.efforts ?? []).filter(v => known(v.ride_watts) && v.ride_watts > 0 && known(v.best_watts) && v.best_watts > 0)
  const improved = peaks.filter(v => v.ride_watts > v.best_watts!)
  const best = [...improved].sort((a,b) => b.ride_watts / b.best_watts! - a.ride_watts / a.best_watts!)[0]
  const stamina = known(bike?.stamina_start_pct) && known(bike?.stamina_end_pct) && bike.stamina_start_pct>=0 && bike.stamina_start_pct<=100 && bike.stamina_end_pct>=0 && bike.stamina_end_pct<=100 ? { start:bike.stamina_start_pct, end:bike.stamina_end_pct } : null
  const sources = [
    {label:'Leistung',available:known(d?.header.np_watts)},
    {label:'Herzfrequenz',available:known(e?.avg_hr) || known(data.streams?.avg_hr)},
    {label:'Kadenz',available:known(data.streams?.avg_cadence)},
    {label:'Höhe',available:known(d?.header.elevation_m)},
    {label:'Stamina',available:stamina!=null},
    {label:'Pedalsensoren',available:known(bike?.balance_left_pct)},
  ]
  return { loadDelta, split, wattsDelta, drift, mixedTerrain, peaks, improved, best, stamina, sources,
    headline: loadDelta != null && loadDelta > 0 ? 'Mehr Reiz.\nMehr Erholung.' : split != null && Math.abs(split) <= 3 ? 'Bis zum Schluss\nauf deinem Niveau.' : split != null && split < -3 ? 'Hinten raus\nweniger Leistung.' : 'Deine Fahrt.\nGenauer verstanden.',
    pacingTitle: split==null?'Pacing noch offen':Math.abs(split)<=3?'Leistung gehalten':split<0?'Zweite Hälfte ruhiger':'Zweite Hälfte stärker',
    pacingRead: split==null?'Ohne Leistungsverlauf lassen sich die Fahrthälften nicht vergleichen.':`${formatValue(p!.first_half_np)} → ${formatValue(p!.second_half_np)} W NP. ${mixedTerrain?'Die Höhenverteilung beeinflusst diesen Vergleich.':'Vergleiche beide Hälften bei ähnlichen Bedingungen.'}`,
    cardiacRead: !known(drift)?'Ohne gemeinsame Leistungs- und Pulsmessung ist die Kopplung nicht messbar.':`${drift===0?'Unveränderte':drift>0?'Später weniger':'Später mehr'} Leistung pro Herzschlag. ${mixedTerrain?'Bei dieser wechselhaften Fahrt ist das kein isolierter Ausdauertest.':'Temperatur, Flüssigkeit und Belastungsverlauf beeinflussen den Wert.'}`,
  }
}

/** Time-weighted observations, preserving nulls. Does not infer sensor cadence from pixels. */
export function cadenceExposure(samples: RideSample[]) {
  const bands = [0,0,0], duration = samples.at(-1)?.seconds ?? 0
  let covered = 0
  samples.slice(0,-1).forEach((s,i)=>{
    const dt = samples[i+1].seconds - s.seconds
    if (dt<=0 || !known(s.cadence) || s.cadence<0) return
    covered += dt
    if (s.cadence>0) bands[s.cadence<70?0:s.cadence<=95?1:2] += dt
  })
  return {bands,pedalling:bands.reduce((s,v)=>s+v,0),coverage:duration>0?covered/duration:null}
}

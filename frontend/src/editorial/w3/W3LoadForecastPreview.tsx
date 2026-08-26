import W3LoadForecastView, { type W3LoadVm } from './W3LoadForecastView'

/** TEMP preview harness — renders W3LoadForecastView with a pen-faithful
 *  fixture, no backend. Route /e/w3-load-preview is unguarded. Mirrors pen2
 *  frame `iiy64`. Remove before merge. */

const FIXTURE: W3LoadVm = {
  intro: 'Verteilung dieser Woche, deine Umsetzung der letzten vier Wochen und was daraus bis zum Renntag wird.',
  weekHours: '8:15 h',
  zones: [
    { label: 'Z1', time: '0:35', frac: 35 },
    { label: 'Z2', time: '5:25', frac: 325 },
    { label: 'Z3', time: '1:05', frac: 65 },
    { label: 'Z4', time: '0:50', frac: 50 },
    { label: 'Z5', time: '0:20', frac: 20 },
  ],
  deineWoche: { easy: 73, hard: 27 },
  zielAufbau: { easy: 80, hard: 20 },
  balanceNote: 'Leicht über dem Zielkorridor – wenn Donnerstag schwer fällt, kürzt der Plan die VO2max-Einheit auf 4 Intervalle.',
  forecastSub: 'Hochrechnung aus 4 Wochen Trainingsdaten',
  threshold: '312',
  thresholdUnit: 'W · 4,3 W/kg',
  delta: '+20 W',
  rangeLow: { v: '298 W', l: 'wenn du kürzt' },
  rangeMid: { v: '312 W', l: 'erwartet' },
  rangeHigh: { v: '320 W', l: 'voll umgesetzt' },
  rangePos: 0.6,
  compliancePct: '86 %',
  complianceDone: 21,
  complianceTotal: 24,
  complianceNote: '21 von 24 Einheiten gefahren. Gekürzt wurden vor allem die langen Fahrten – genau die, auf die es beim Harz Extrem ankommt.',
}

export default function W3LoadForecastPreview() {
  return <W3LoadForecastView vm={FIXTURE} onBack={() => history.back()} onAdjust={() => { location.assign('/e/w3-plan-preview') }} />
}

import W3ReadinessView, { type W3ReadinessVm } from './W3ReadinessView'

/** TEMP preview — fixture, no backend. /e/w3-readiness-preview is unguarded;
 *  remove before merge. */

const sp = (n: number[]) => { const m = Math.max(...n, 1); return n.map((v) => Math.max(0.08, v / m)) }

const FIXTURE: W3ReadinessVm = {
  score: 78,
  word: 'Gut erholt',
  guidanceTitle: 'Du bist bereit für Leistung',
  guidanceBody: 'HRV und Ruhepuls sind im gesunden Bereich. Heute darf die Belastung höher liegen.',
  dateNote: 'Overnight-Signale · Stand Di, 12. Aug',
  trend: sp([62, 58, 71, 66, 74, 70, 78]),
  limiterNote: null,
  drivers: [
    { icon: 'hrv', label: 'HRV', value: '84', unit: 'ms', delta: '+6', deltaGood: true, frac: 0.7, spark: sp([70, 66, 74, 78, 72, 80, 84]) },
    { icon: 'rhr', label: 'Ruhepuls', value: '48', unit: 'bpm', delta: '−2', deltaGood: true, frac: 0.78, spark: sp([52, 51, 50, 49, 50, 49, 48]) },
    { icon: 'sleep', label: 'Schlaf', value: '7:42', unit: 'h', delta: '+0:24', deltaGood: true, frac: 0.85, spark: sp([6.5, 7, 6.8, 7.5, 7.2, 7.6, 7.7]) },
    { icon: 'battery', label: 'Body Battery', value: '82', unit: '%', delta: '+9', deltaGood: true, frac: 0.82, spark: sp([60, 66, 70, 74, 76, 80, 82]) },
    { icon: 'stress', label: 'Stress', value: '28', unit: '', delta: '−5', deltaGood: true, frac: 0.72, spark: sp([40, 38, 34, 32, 33, 30, 28]) },
    { icon: 'recovery', label: 'Erholung', value: '9', unit: 'h', delta: '−4', deltaGood: true, frac: 0.81, spark: sp([18, 16, 14, 12, 11, 10, 9]) },
  ],
}

export default function W3ReadinessPreview() {
  return <W3ReadinessView vm={FIXTURE} onBack={() => history.back()} />
}

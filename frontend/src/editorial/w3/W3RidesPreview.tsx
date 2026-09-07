import W3RidesView, { type W3RidesVm } from './W3RidesView'

/** TEMP preview — pen-exact fixture (frame `zMKRG`), no backend. Route
 *  /e/w3-rides-preview is unguarded; remove before merge. Every number here is a
 *  DESIGN FIXTURE transcribed from the pen (incl. the synthetic route traces and
 *  the coaching bullets) — the live /e/w3-rides page derives all of this from
 *  real activities. */

// synthetic route shapes purely for the preview thumbnails ([lat, lng])
const LOOP: [number, number][] = [[3, 1], [3.4, 2.2], [2.8, 3], [3.2, 3.9], [2.4, 4], [1.6, 3.4], [1.9, 2.3], [1.2, 1.8], [1.7, 0.9], [2.5, 0.7], [3, 1]]
const BLOB: [number, number][] = [[2, 0.5], [3.4, 0.9], [3.9, 2], [3.6, 3.2], [2.6, 3.9], [1.4, 3.6], [0.7, 2.4], [1, 1.2], [2, 0.5]]
const PROFILE: [number, number][] = [[3.4, 0.4], [3, 1], [3.2, 1.6], [2.6, 2], [2.9, 2.6], [2.2, 3], [2.5, 3.6], [1.8, 4]]
const ZIG: [number, number][] = [[3.6, 0.5], [1, 1.2], [3.4, 1.9], [1.2, 2.6], [3.2, 3.3], [1.4, 4]]

const FIXTURE: W3RidesVm = {
  title: 'Fahrten',
  loggedLabel: 'ERFASST',
  count: '142 Fahrten',
  seasonLabel: 'SAISON GESAMT',
  totalKm: '4 812',
  totalUnit: 'km',
  ofGoalLabel: 'VOM ZIEL',
  bars: [0.42, 0.5, 0.4, 0.55, 0.48, 0.62, 0.44, 0.66, 0.72, 0.52, 0.9, 0.86],
  barMonths: ['Sep', 'Okt', 'Nov', 'Dez', 'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug']
    .map((label, i) => ({ label, year: i < 4 ? 2025 : 2026,
      km: Math.round([0.42, 0.5, 0.4, 0.55, 0.48, 0.62, 0.44, 0.66, 0.72, 0.52, 0.9, 0.86][i] * 620) })),
  barsAccentFrom: 7,
  avgSpeed: '29.4',
  avgPower: '214',
  saddleTime: '168:24',
  rides: [
    { id: 1, title: 'Schwelle am Abend', dateLabel: 'DI 12 AUG', km: '40.34', speed: '31.5', power: '248', dur: '1:16', note: '+14 W auf deine letzte Schwelle', indoor: false, race: false, recent: true, polyline: LOOP },
    { id: 2, title: 'Die lange Sonntagsrunde', dateLabel: 'SO 10 AUG', km: '128.6', speed: '28.9', power: '196', dur: '4:26', note: 'Längste Fahrt seit April', indoor: false, race: false, recent: true, polyline: BLOB },
    { id: 3, title: 'Lockeres Ausfahren', dateLabel: 'SA 09 AUG', km: '32.1', speed: '25.4', power: '132', dur: '1:15', note: 'Unter 60 % geblieben — genau wie verlangt', indoor: false, race: false, recent: true, polyline: PROFILE },
    { id: 4, title: 'Berg-Wiederholungen', dateLabel: 'DO 07 AUG', km: '54.8', speed: '27.2', power: '231', dur: '2:01', note: 'Drittbeste VAM dieser Saison', indoor: false, race: false, recent: false, polyline: ZIG },
    { id: 5, title: 'Schwelle auf der Rolle', dateLabel: 'DI 05 AUG', km: '35.0', speed: '33.1', power: '262', dur: '1:03', note: '2 W unter deinem Indoor-Bestwert', indoor: true, race: false, recent: false, polyline: null },
  ],
  // fixture: goal-tracking block (a preview rider who set 12 000 km)
  goal: {
    chip: 'ZIEL 12 000 KM',
    ofGoalPct: '40%',
    progress: 0.4,
    toGoLabel: 'NOCH 7 188 KM',
    paceLabel: '312 KM VOR PLAN',
    paceAhead: true,
  },
}

export default function W3RidesPreview() {
  return <W3RidesView vm={FIXTURE} />
}

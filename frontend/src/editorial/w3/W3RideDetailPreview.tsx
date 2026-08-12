import W3RideDetailView, { type W3RideVm } from './W3RideDetailView'

/** TEMP preview — pen-exact fixture, no backend. /e/w3-ride-preview is
 *  unguarded; remove before merge. */

const power = Array.from({ length: 40 }, (_, i) => {
  const inRep = [3, 4, 9, 10, 15, 16, 21, 22, 27, 28, 33, 34].includes(i)
  return inRep ? 0.85 + Math.random() * 0.12 : 0.28 + Math.random() * 0.12
})

const FIXTURE: W3RideVm = {
  dateChip: 'Wed 06 Aug · 09:12', sportChip: 'Outdoor', recordChip: 'New record',
  title: 'Hill repeats',
  bigStat: '62', bigStatUnit: 'Kilometres', climb: '1240 m up', avgSpeed: '30 km/h',
  power, powerNote: 'Six repeats · none dropped',
  stats: [
    { v: '198 W', l: 'AVERAGE POWER', s: '244 W normalised' },
    { v: '2:04', l: 'MOVING TIME', s: '62 km at 30 km/h' },
    { v: '124', l: 'LOAD · TSS', s: 'biggest since June' },
    { v: '148', l: 'AVG HR · BPM', s: 'peak 176 on repeat 6' },
  ],
  execScore: '94', execTotal: '100',
  verdictHeadline: 'You held every one of them.',
  verdictBody: 'Six repeats at 285 W, six of them on or above target. The last was the strongest of the day at 294 W — you have never closed a threshold session going up. The one you overcooked was the first, and it charged you at minute forty.',
  aiModel: 'claude-sonnet-4-6',
  repeatsScore: '5 of 6', repeatsSub: 'Only repeat 4 slipped, by 3 W',
  repeats: [
    { label: 'REPEAT 1', watts: '292 W', delta: 7, verdict: 'HELD' },
    { label: 'REPEAT 2', watts: '289 W', delta: 4, verdict: 'HELD' },
    { label: 'REPEAT 3', watts: '287 W', delta: 2, verdict: 'HELD' },
    { label: 'REPEAT 4', watts: '282 W', delta: -3, verdict: 'FADED' },
    { label: 'REPEAT 5', watts: '290 W', delta: 5, verdict: 'HELD' },
    { label: 'REPEAT 6', watts: '294 W', delta: 9, verdict: 'STRONGEST' },
  ],
  zonesSub: 'Two hours, 124 minutes of it recorded. Zone 4 took a third of the ride.',
  zones: [
    { z: 'ZONE 1', name: 'Recovery', min: '22 min', pct: 18, peak: false },
    { z: 'ZONE 2', name: 'Endurance', min: '38 min', pct: 31, peak: false },
    { z: 'ZONE 3', name: 'Tempo', min: '18 min', pct: 15, peak: false },
    { z: 'ZONE 4', name: 'Threshold', min: '42 min', pct: 34, peak: true },
    { z: 'ZONE 5', name: 'VO2 max', min: '4 min', pct: 3, peak: false },
  ],
  ranksSub: 'Every duration against your best. Twenty segments to your record.',
  ranks: [
    { dur: '5 SEC', watts: '1,180 W', note: 'BEST 1,240 IN MAY', pr: false, fill: 0.8 },
    { dur: '1 MIN', watts: '598 W', note: 'BEST 620 IN JUNE', pr: false, fill: 0.72 },
    { dur: '5 MIN', watts: '342 W', note: 'NEW BEST · +7 W', pr: true, fill: 1 },
    { dur: '12 MIN', watts: '279 W', note: 'BEST 288 W · 12 MAY', pr: false, fill: 0.66 },
    { dur: '20 MIN', watts: '268 W', note: 'BEST 276 IN JULY', pr: false, fill: 0.58 },
  ],
  onYouDelta: '+14', ceilingBefore: '328', ceilingAfter: '342',
  fitness: '78', fitnessD: '+2', fatigue: '68', fatigueD: '+14', form: '+10', formD: '-12',
  changesBody: 'Form dips for three days. That is the price of the ceiling — pay it and it comes back higher.',
  seasonSub: 'Sixty-two kilometres and 1240 metres of climbing, spent on the year.',
  season: [
    { label: 'Season distance', delta: '+62 km', value: '4 812', target: '12 000 km', pct: 0.4 },
    { label: 'Climbing', delta: '+1240 m', value: '41 260', target: '100 000 m', pct: 0.41 },
    { label: 'Rides logged', delta: '+1', value: '142', target: '200', pct: 0.71 },
  ],
  seasonBody: 'Two more rides like this and the twelve thousand lands in October, not December.',
}

export default function W3RideDetailPreview() {
  return <W3RideDetailView vm={FIXTURE} onBack={() => history.back()} />
}

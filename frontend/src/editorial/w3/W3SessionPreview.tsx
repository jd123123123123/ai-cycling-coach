import W3SessionView, { type W3SessionVm } from './W3SessionView'

/** TEMP preview harness — renders W3SessionView with the pen's exact values,
 *  no backend. Route /e/w3-session-preview is unguarded; remove before merge. */

const STEPS = [
  { idx: '01', name: 'WARM UP', note: 'Spin up, one 30 s opener', watts: '150 → 180 W', dur: '10:00', isMain: false, fill: 0.3 },
  { idx: '02', name: 'BLOCK 1', note: 'Settle in — do not chase it', watts: '285 W', dur: '8:00', isMain: true, fill: 0.97 },
  { idx: '03', name: 'RECOVER', note: 'Legs turning, nothing more', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '04', name: 'BLOCK 2', note: 'Find the rhythm', watts: '288 W', dur: '8:00', isMain: true, fill: 0.98 },
  { idx: '05', name: 'RECOVER', note: 'Drink here', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '06', name: 'BLOCK 3', note: 'Stay patient, this is the dip', watts: '290 W', dur: '8:00', isMain: true, fill: 0.99 },
  { idx: '07', name: 'RECOVER', note: 'Last gel', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '08', name: 'BLOCK 4', note: 'Empty it — this is the one', watts: '292 W', dur: '8:00', isMain: true, fill: 1 },
  { idx: '09', name: 'COOL', note: 'Easy, let HR fall under 120', watts: '160 W', dur: '5:00', isMain: false, fill: 0.32 },
]

const FIXTURE: W3SessionVm = {
  navTitle: 'Today’s session',
  title: 'Threshold blocks',
  numeral: '4 × 8',
  qualifier: '8 MIN BLOCKS',
  thresholdW: '285 W',
  totalTime: '1:15',
  gauge: [false, false, false, false, false, true, true, false, true, true, false, true, true, false, true, true, false, false, false, false],
  prescriptionClaim: 'Four blocks at 285 W. Hold the fourth one and the season’s biggest number is yours.',
  stats: [
    { v: '1:15', l: 'DURATION', s: '0:52 in the blocks' },
    { v: '112', l: 'LOAD · TSS', s: '+14 on last Tuesday' },
    { v: '98%', l: 'OF FTP 292', s: 'just under threshold' },
    { v: '986', l: 'WORK · KJ', s: '2 900 kcal burn' },
  ],
  shapeBars: [
    { w: 0.25, work: false }, { w: 0.33, work: false }, { w: 0.4, work: false },
    { w: 0.93, work: true }, { w: 0.2, work: false },
    { w: 0.94, work: true }, { w: 0.2, work: false },
    { w: 0.95, work: true }, { w: 0.2, work: false },
    { w: 0.96, work: true }, { w: 0.3, work: false },
  ],
  shapeFtpTag: 'FTP 292 W',
  shapeLabels: ['WARM UP 10 MIN', '4 × 8 MIN AT 285 W', 'COOL 5 MIN'],
  stepsMeta: '9 steps · 1:15',
  steps: STEPS,
  howToRide: [
    { label: 'HR AT MINUTE 3', value: '165 bpm', band: 'mid' },
    { label: 'WORDS PER BREATH', value: '3 – 4', band: 'mid' },
    { label: 'HR WHEN BLOCK 5 STARTS', value: '135 bpm', band: 'low' },
    { label: 'CADENCE', value: '91 rpm', band: 'mid' },
  ],
  route: {
    name: 'Elbe Loop · Nord',
    lastRidden: 'LAST RIDDEN 2 AUG',
    stats: [
      { v: '1:50', l: 'EXPECTED' },
      { v: '48 km', l: 'DISTANCE' },
      { v: '320 m', l: 'CLIMBING' },
      { v: '6×', l: 'RIDDEN' },
    ],
    notes: [
      'Three ramps, 8–9 min each — one block per ramp',
      'Two junctions inside block 2 — roll through, don’t stop',
      'Your best here is 1:44, set on 12 May',
    ],
    foot: '19° feels 17 · 8 km/h SW · light till 20:41',
  },
  unlocks: [
    { icon: 'zap', v: '4,200', l: 'POWER', s: 'Banked the moment you confirm' },
    { icon: 'hexagon', v: '18/25', l: 'CARBON FRAME', s: 'Seven rides from unlocked' },
    { icon: 'flame', v: 'DAY 18', l: 'STREAK', s: 'Your longest run yet' },
    { icon: 'users', v: '#3', l: 'IN YOUR CLUB', s: 'Up two places this week' },
  ],
  record: { pct: 72, tag: '12-MIN BEST', label: 'chance you take the record today', why: 'Block 4 is eight minutes at 292 W. Your 12-minute best is 288 W from 12 May, and you have beaten that pace three times this month. Hold the last block and the maths does the rest.' },
  sendTarget: 'Garmin Edge 840',
}

export default function W3SessionPreview() {
  return <W3SessionView vm={FIXTURE} onBack={() => history.back()} />
}

import W3SessionView, { type W3SessionVm } from './W3SessionView'
import { funName, powerProfile, effortGuide } from './w3session'

/** TEMP preview harness — renders W3SessionView with a representative session,
 *  no backend. Route /e/w3-session-preview is unguarded. Uses the same helpers
 *  the live page does (funName / powerProfile / effortGuide) so the preview
 *  and production always drift together, not apart. */

const STEPS = [
  { idx: '01', name: 'Warm up', note: 'Z1 · spin up, one 30 s opener', watts: '150 → 180 W', dur: '10:00', isMain: false, fill: 0.3 },
  { idx: '02', name: 'Block 1', note: 'Z4 · settle in, don’t chase it', watts: '285 W', dur: '8:00', isMain: true, fill: 0.97 },
  { idx: '03', name: 'Recover', note: 'Z1 · legs turning, nothing more', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '04', name: 'Block 2', note: 'Z4 · find the rhythm', watts: '288 W', dur: '8:00', isMain: true, fill: 0.98 },
  { idx: '05', name: 'Recover', note: 'Z1 · drink here', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '06', name: 'Block 3', note: 'Z4 · stay patient, this is the dip', watts: '290 W', dur: '8:00', isMain: true, fill: 0.99 },
  { idx: '07', name: 'Recover', note: 'Z1 · last gel', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '08', name: 'Block 4', note: 'Z4 · empty it, this is the one', watts: '292 W', dur: '8:00', isMain: true, fill: 1 },
  { idx: '09', name: 'Cool', note: 'Z1 · easy, let HR fall under 120', watts: '160 W', dur: '5:00', isMain: false, fill: 0.32 },
]

const IFF = 0.9 // representative threshold session

const FIXTURE: W3SessionVm = {
  navTitle: 'Today’s session',
  funName: funName('threshold_4x8', IFF, 'Threshold blocks'),
  title: 'Threshold blocks',
  numeral: '4 × 8',
  qualifier: 'Z4',
  thresholdW: '285 W',
  totalTime: '1:15',
  gauge: [false, false, false, false, false, true, true, false, true, true, false, true, true, false, true, true, false, false, false, false],
  prescriptionClaim: 'Four blocks at 285 W. Hold the fourth and the season’s biggest number is yours.',
  stats: [
    { icon: 'clock', v: '1:15', l: 'DURATION', s: '52 min in zone' },
    { icon: 'flame', v: '112', l: 'LOAD · TSS', s: '90% of FTP' },
    { icon: 'zap', v: '285 W', l: 'TARGET', s: 'work interval' },
    { icon: 'gauge', v: '32', l: 'MIN IN ZONE', s: 'at or above target' },
  ],
  shapeBars: powerProfile([
    { w: 0.25, work: false }, { w: 0.33, work: false }, { w: 0.4, work: false },
    { w: 0.93, work: true }, { w: 0.2, work: false },
    { w: 0.94, work: true }, { w: 0.2, work: false },
    { w: 0.95, work: true }, { w: 0.2, work: false },
    { w: 0.96, work: true }, { w: 0.3, work: false },
  ], true),
  shapeFtpTag: 'Target 285 W',
  shapeLabels: ['WARM UP', 'Z4', 'COOL'],
  stepsMeta: '9 steps · 1:15',
  steps: STEPS,
  effort: effortGuide(IFF),
  route: {
    name: 'Elbe Loop · Nord',
    lastRidden: 'RIDDEN 6×',
    stats: [
      { v: '48 km', l: 'DISTANCE' },
      { v: '320 m', l: 'CLIMBING' },
      { v: '1:50', l: 'EXPECTED' },
      { v: '6×', l: 'RIDDEN' },
    ],
    notes: ['Matched to today’s blocks from your own rides.'],
    foot: 'Drawn from your recorded track for this route.',
  },
  earns: [
    { icon: 'flame', v: 'DAY 19', l: 'STREAK', s: 'Extends your 18-day run' },
    { icon: 'zap', v: '+112', l: 'TSS BANKED', s: 'Added to this week’s load' },
    { icon: 'clock', v: '1:15', l: 'SADDLE TIME', s: 'Logged to your season' },
  ],
  earnNote: 'Finishing this ride also awards RideCoin, scaled to its TSS.',
  canExport: true,
  primaryLabel: 'Export to your head unit',
}

export default function W3SessionPreview() {
  return (
    <W3SessionView
      vm={FIXTURE}
      onBack={() => history.back()}
      onShare={() => {}}
      onExport={() => {}}
      onToday={() => { location.hash = '#/e/w3-today' }}
    />
  )
}

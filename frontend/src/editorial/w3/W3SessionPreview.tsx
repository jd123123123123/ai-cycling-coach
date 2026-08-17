import W3SessionView, { type W3SessionVm } from './W3SessionView'
import { funName, powerProfile, effortGuide } from './w3session'

/** TEMP preview harness — renders W3SessionView with a representative session,
 *  no backend. Route /e/w3-session-preview is unguarded. Uses the same helpers
 *  the live page does (funName / powerProfile / effortGuide) so the preview
 *  and production always drift together, not apart. */

const STEPS = [
  { idx: '01', name: 'Einrollen', note: 'Z1 · locker kurbeln, ein 30-s-Opener', watts: '150 → 180 W', dur: '10:00', isMain: false, fill: 0.3 },
  { idx: '02', name: 'Block 1', note: 'Z4 · reinfinden, nicht jagen', watts: '285 W', dur: '8:00', isMain: true, fill: 0.97 },
  { idx: '03', name: 'Erholen', note: 'Z1 · Beine drehen, mehr nicht', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '04', name: 'Block 2', note: 'Z4 · Rhythmus finden', watts: '288 W', dur: '8:00', isMain: true, fill: 0.98 },
  { idx: '05', name: 'Erholen', note: 'Z1 · hier trinken', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '06', name: 'Block 3', note: 'Z4 · geduldig bleiben, das ist das Tief', watts: '290 W', dur: '8:00', isMain: true, fill: 0.99 },
  { idx: '07', name: 'Erholen', note: 'Z1 · letztes Gel', watts: '140 W', dur: '4:00', isMain: false, fill: 0.28 },
  { idx: '08', name: 'Block 4', note: 'Z4 · alles raus, das ist der Block', watts: '292 W', dur: '8:00', isMain: true, fill: 1 },
  { idx: '09', name: 'Ausrollen', note: 'Z1 · locker, HF unter 120 fallen lassen', watts: '160 W', dur: '5:00', isMain: false, fill: 0.32 },
]

const IFF = 0.9 // representative threshold session

const FIXTURE: W3SessionVm = {
  navTitle: 'Einheit heute',
  funName: funName('threshold_4x8', IFF, 'Schwellenblöcke'),
  title: 'Schwellenblöcke',
  numeral: '4 × 8',
  qualifier: 'Z4',
  thresholdW: '285 W',
  totalTime: '1:15',
  gauge: [false, false, false, false, false, true, true, false, true, true, false, true, true, false, true, true, false, false, false, false],
  prescriptionClaim: 'Vier Blöcke bei 285 W. Hältst du den vierten, gehört dir die größte Zahl der Saison.',
  stats: [
    { icon: 'clock', v: '1:15', l: 'DAUER', s: '52 min in Zone' },
    { icon: 'flame', v: '112', l: 'BELASTUNG · TSS', s: '90% von FTP' },
    { icon: 'zap', v: '285 W', l: 'ZIEL', s: 'im Hauptteil' },
    { icon: 'gauge', v: '32', l: 'MIN IN ZONE', s: 'auf Ziel oder darüber' },
  ],
  shapeBars: powerProfile([
    { w: 0.25, work: false }, { w: 0.33, work: false }, { w: 0.4, work: false },
    { w: 0.93, work: true }, { w: 0.2, work: false },
    { w: 0.94, work: true }, { w: 0.2, work: false },
    { w: 0.95, work: true }, { w: 0.2, work: false },
    { w: 0.96, work: true }, { w: 0.3, work: false },
  ], true),
  shapeFtpTag: 'Ziel 285 W',
  shapeLabels: ['EINROLLEN', 'Z4', 'AUSROLLEN'],
  stepsMeta: '9 Blöcke · 1:15',
  steps: STEPS,
  effort: effortGuide(IFF),
  route: {
    name: 'Elbe Loop · Nord',
    lastRidden: '6× GEFAHREN',
    stats: [
      { v: '48 km', l: 'DISTANZ' },
      { v: '320 m', l: 'HÖHENMETER' },
      { v: '1:50', l: 'ERWARTET' },
      { v: '6×', l: 'GEFAHREN' },
    ],
    notes: ['Aus deinen eigenen Fahrten zu den heutigen Blöcken passend.'],
    foot: 'Aus deinem aufgezeichneten Track für diese Strecke.',
  },
  earns: [
    { icon: 'flame', v: 'TAG 19', l: 'STREAK', s: 'Verlängert deinen 18-Tage-Streak' },
  ],
  // The hard case on purpose: 112 TSS against a season of 12 480 is 0.9%, and
  // 1:15 against 168:24 is 0.7% — the slivers the ledger bar has to keep
  // readable without inflating them.
  ledgers: [
    { icon: 'zap', label: 'SAISON-TSS', banked: '12,480', delta: '+112', total: '12,592', share: 112 / 12592, note: '1.3× die Belastung deiner bisherigen Durchschnittsfahrt dieser Saison.' },
    { icon: 'clock', label: 'SATTEL · SAISON · H:MM', banked: '168:24', delta: '+1:15', total: '169:39', share: 75 / 10179, note: '0.9× so lang wie deine bisherige Durchschnittsfahrt dieser Saison.' },
  ],
  earnNote: 'Fährst du sie zu Ende, gibt es zusätzlich RideCoin — skaliert nach TSS.',
  canExport: true,
  primaryLabel: 'Zum Head-Unit exportieren',
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

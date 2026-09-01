import { Bike, Mountain, Route, Timer, Trophy, Zap } from 'lucide-react'
import { T, FONT } from './w3tokens'
import { W3WinsContent, W3WinsDock, type W3WinsVm } from './W3WinsView'
import './w3.css'

/**
 * `/e/w3-wins-preview` — the Erfolge screen at a rider who has ridden for two
 * years, drawn without auth so the design can be looked at.
 *
 * The room is NOT here on purpose: in the app this screen nests under
 * `W3HeroShell` and its ledger rides in the panel over the bike. A preview that
 * mounted the stage would be testing the room, which `W3RoomPreview` already
 * does. This draws the dock inline above the chapters so both halves are
 * visible in one frame.
 *
 * `?empty` renders the rider who has not ridden yet — the state that decides
 * whether every chapter degrades honestly or the page goes blank.
 */

/** Two years of threshold measurements, rising and then flattening — the shape
 *  a real series has, not a clean ramp. */
const FTP_POINTS = [214, 221, 228, 226, 238, 247, 244, 258, 266, 271, 269, 280, 288, 292]

const FIXTURE: W3WinsVm = {
  micro: 'ERFOLGE',
  ledger: [
    { key: 'badges', value: '12', unit: 'von 30', label: 'ABZEICHEN' },
    { key: 'km', value: '14.820', unit: 'km', label: 'GESAMT' },
    { key: 'rides', value: '284', label: 'FAHRTEN' },
  ],
  ftp: {
    eyebrow: 'SCHWELLENLEISTUNG',
    statement: 'Deine Schwelle liegt 78 W über deiner ersten Messung.',
    firstLabel: 'ERSTE MESSUNG',
    firstValue: '214',
    nowLabel: 'HEUTE',
    nowValue: '292',
    unit: 'W',
    points: FTP_POINTS.map((w, i) => ({ pct: w / 292, current: i === FTP_POINTS.length - 1 })),
    caption: '14 Messungen in 17 Monaten. Der letzte Wert stammt vom 11.08.26.',
  },
  milestones: {
    eyebrow: 'MEILENSTEINE',
    statement: 'Wiederholungstäter ist noch 16 entfernt.',
    rows: [
      { key: 'a', icon: Bike, title: 'Wiederholungstäter', value: '284 / 300 Fahrten', pct: 0.947 },
      { key: 'b', icon: Mountain, title: 'Höhenjäger', value: '182.400 / 200.000 hm', pct: 0.912 },
      { key: 'c', icon: Timer, title: 'Zeit im Sattel', value: '612 / 750 Std', pct: 0.816 },
      { key: 'd', icon: Route, title: 'Weltenbummler', value: '14.820 / 20.000 km', pct: 0.741 },
    ],
  },
  rhythm: {
    eyebrow: 'DEIN RHYTHMUS',
    statement: 'In 46 von 52 Wochen bist du gefahren.',
    // THE SHAPES ARE THE SERVER'S. `weeks` carries `start`/`rides`/`minutes`
    // because `weekly_consistency` emits exactly that, and the week tile's
    // ramp reads `minutes` — a fixture of bare 0..3 buckets would have drawn a
    // grid the real payload cannot produce, which is how four live bugs
    // stayed invisible on this app's other preview screens.
    rhythm: {
      season: {
        year: 2026, prevYear: 2025,
        current: { rides: 168, km: 6420.4, minutes: 19_180 },
        previous: { rides: 141, km: 5180.9, minutes: 16_040 },
      },
      months: [
        { start: '2025-10-01', rides: 12, km: 402.5, minutes: 1180 },
        { start: '2025-11-01', rides: 9, km: 288.1, minutes: 890 },
        { start: '2025-12-01', rides: 6, km: 171.3, minutes: 540 },
        { start: '2026-01-01', rides: 11, km: 355.8, minutes: 1090 },
        { start: '2026-02-01', rides: 13, km: 468.2, minutes: 1385 },
        { start: '2026-03-01', rides: 17, km: 651.7, minutes: 1920 },
        { start: '2026-04-01', rides: 19, km: 742.9, minutes: 2210 },
        { start: '2026-05-01', rides: 22, km: 918.4, minutes: 2680 },
        { start: '2026-06-01', rides: 21, km: 874.6, minutes: 2540 },
        { start: '2026-07-01', rides: 24, km: 1012.3, minutes: 2960 },
        { start: '2026-08-01', rides: 20, km: 806.1, minutes: 2375 },
        { start: '2026-09-01', rides: 3, km: 118.7, minutes: 330 },
      ],
      weeks: [1, 2, 0, 2, 3, 1, 3, 3, 0, 3, 3, 2, 3,
              3, 3, 2, 0, 3, 3, 3, 2, 1, 3, 3, 3, 2,
              3, 0, 2, 3, 3, 3, 1, 3, 2, 3, 3, 0, 3,
              2, 3, 3, 3, 1, 2, 3, 3, 0, 3, 2, 3, 3].map((n, i) => ({
        start: new Date(Date.UTC(2025, 8, 8) + i * 7 * 86_400_000).toISOString().slice(0, 10),
        rides: n,
        // A REAL YEAR'S SPREAD, not `n * 105`. Flat multiples of the ride
        // count gave every lit week the same two values, the ramp maxed out
        // on nearly all of them, and the grid rendered as a solid wall of
        // accent — a fixture artefact that would have been read as a design
        // problem. Winter weeks are short, summer weeks long.
        minutes: n === 0 ? 0 : Math.round(
          n * (52 + 46 * Math.sin(((i + 4) / 52) * Math.PI * 2)) + (i % 7) * 11,
        ),
      })),
      ridden: 46,
      of: 52,
      longestStreak: 19,
    },
  },
  beams: {
    eyebrow: 'BESTWERTE · LEISTUNGSKURVE',
    statement: '2 Bestwerte sind zuletzt neu gesetzt worden.',
    colLeft: 'DAUER',
    colRight: 'SPITZENLEISTUNG',
    beams: [
      { key: '5s', label: '5 Sek', value: '1.180', unit: 'W', frac: 1, date: '04.08.26', fresh: true },
      { key: '1m', label: '1 Min', value: '620', unit: 'W', frac: 0.525, date: '17.05.26', fresh: false },
      { key: '12m', label: '12 Min', value: '372', unit: 'W', frac: 0.315, date: '11.08.26', fresh: true },
      { key: '20m', label: '20 Min', value: '318', unit: 'W', frac: 0.269, date: '02.06.26', fresh: false },
    ],
  },
  medals: {
    eyebrow: 'AUSZEICHNUNGEN',
    counter: '12 VON 30',
    statement: '12 von 30 Auszeichnungen sind freigeschaltet.',
    medals: [
      { key: '1', icon: Trophy, title: 'ERSTE 100', note: 'SEP 24', earned: true },
      { key: '2', icon: Route, title: '10.000 KM', note: 'MAI 25', earned: true },
      { key: '3', icon: Mountain, title: 'BERGKÖNIG', note: 'JUL 25', earned: true },
      { key: '4', icon: Zap, title: 'EISERN', note: 'FEB 26', earned: true },
      { key: '5', icon: Mountain, title: '100.000 HM', note: '91 %', earned: false },
      { key: '6', icon: Bike, title: '300 FAHRTEN', note: '95 %', earned: false },
    ],
  },
  biggestDay: {
    eyebrow: 'DEIN GRÖSSTER TAG',
    statement: '142,3 Kilometer an einem Tag — deine längste Fahrt.',
    title: 'ALPENPASS · 24.08.26',
    km: '142,3',
    kmUnit: 'km',
    time: '5:12:40',
    ascent: '2.180',
    ascentUnit: 'hm',
    badges: [{ label: 'LÄNGSTE FAHRT', icon: Trophy }, { label: 'HÖCHSTER TAG', icon: Mountain }],
    cta: 'Als Karte teilen',
  },
  empty: null,
}

/** Nothing has resolved — every chapter is null and the page says so once. */
const EMPTY: W3WinsVm = {
  micro: 'ERFOLGE',
  ledger: [
    { key: 'badges', value: '—', unit: null, label: 'ABZEICHEN' },
    { key: 'km', value: '—', unit: 'km', label: 'GESAMT' },
    { key: 'rides', value: '—', label: 'FAHRTEN' },
  ],
  ftp: null, milestones: null, rhythm: null, beams: null, medals: null, biggestDay: null,
  empty: 'Deine erste gewertete Fahrt füllt diese Seite. Bis dahin gibt es hier nichts zu zeigen.',
}

export default function W3WinsPreview() {
  const empty = typeof window !== 'undefined' && window.location.search.includes('empty')
  const vm = empty ? EMPTY : FIXTURE
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, background: T.bg, display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingTop: 18 }}>
        {/* Stands in for the panel over the floor. */}
        <div style={{ padding: '0 20px 26px' }}>
          <W3WinsDock items={vm.ledger} />
        </div>
        <W3WinsContent vm={vm} />
      </div>
    </div>
  )
}

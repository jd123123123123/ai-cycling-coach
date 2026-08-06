/**
 * Visual harness. Renders a real screen from a fixture model and writes
 * standalone HTML, so a screen can be LOOKED AT without a backend, auth, or a
 * dev server — the node tree tells you the spec, only pixels tell you whether
 * the screen works.
 *
 * Skipped in the normal suite. To use it:
 *   HARNESS_OUT=/tmp/trained.html npx vitest run src/editorial/__tests__/_visual.harness.test.tsx
 *   python3 -m http.server 8971 --directory /tmp   # file:// is blocked in the browser tool
 * then open http://localhost:8971/trained.html at 390x844.
 */
import { render } from '@testing-library/react'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { describe, it } from 'vitest'

const OUT = process.env.HARNESS_OUT
import { present, missing } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import type { SessionModel } from '../data/useSessionModel'
import TodayView from '../pages/TodayView'
import { SessionDetailView } from '../pages/SessionDetailPage'

function buildPmcSeries(days: number) {
  const out = []
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1)
    out.push({
      date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      ctl: 44 + t * 24 + Math.sin(i / 3) * 1.5,
      atl: 40 + t * 30 + Math.sin(i / 2) * 3,
      tsb: (44 + t * 24) - (40 + t * 30),
    })
  }
  return out
}

const model: TodayModel = {
  state: 'trained',
  dateLabel: present('MI 22 JUL'),
  streakDays: present(13),
  readiness: present({ score: 74, deltaVsYesterday: 8 }),
  readiness90DayBest: present(77),
  bodyBattery90DayHigh: missing('Noch keine 90-Tage-Historie erfasst.'),
  hrv: present({ value: 68, unit: 'ms', delta: 4, band: { low: 52, high: 74, position: 'above' } }),
  restingHr: present({ value: 46, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'in' } }),
  recentRestingHr: present([{ date: '2026-07-22', bpm: 46 }]),
  sleep: present({ totalS: 27000, deepS: 4800, remS: 5400, lightS: 15600, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 58, form: -2, series: buildPmcSeries(42) }),
  recovery: present({ hoursRemaining: 26, clearAtLabel: 'Fr 09:00' }),
  bodyBattery: missing('Keine Messung seit Dienstag.'),
  session: present({
    title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
    blocks: [
      { label: 'Warm-up', minutes: 12, watts: 180 },
      { label: 'Block 1', minutes: 12, watts: 285 },
      { label: 'Recover', minutes: 5, watts: 150 },
      { label: 'Block 2', minutes: 12, watts: 283 },
      { label: 'Recover', minutes: 5, watts: 150 },
      { label: 'Block 3', minutes: 12, watts: 283 },
      { label: 'Recover', minutes: 5, watts: 150 },
      { label: 'Block 4', minutes: 12, watts: 285 },
      { label: 'Cool-down', minutes: 10, watts: 120 },
    ],
  }),
  ride: present({ activityId: 1, distanceM: 52400, kj: 1148, avgHr: 151, np: 296, durationS: 6420 }),
  zones: present([
    { name: 'Z1', lowBpm: 0, highBpm: 124, seconds: 1320 },
    { name: 'Z2', lowBpm: 124, highBpm: 141, seconds: 1440 },
    { name: 'Z3', lowBpm: 142, highBpm: 152, seconds: 1080 },
    { name: 'Z4', lowBpm: 153, highBpm: 163, seconds: 2340 },
    { name: 'Z5', lowBpm: 164, highBpm: Infinity, seconds: 240 },
  ]),
  peaks: present([
    { duration: '5s', watts: 812, percentOfSeasonBest: null },
    { duration: '1min', watts: 468, percentOfSeasonBest: null },
    { duration: '5min', watts: 328, percentOfSeasonBest: null },
    { duration: '12min', watts: 288, percentOfSeasonBest: null },
  ]),
  planVsRidden: missing('This ride was not matched to its plan.'),
  verdict: present({
    headline: 'Die Arbeit ist auf dem Konto.',
    body: 'Sauber eingefahren. Alles ab hier ist Absorption.',
  }),
  whatThisChanges: present({
    onYou: { claim: 'Deine 12-Minuten-Decke steigt auf 288 W', detail: 'Schwellenreferenz aktualisiert.' },
    onThePlan: { claim: 'Donnerstags VO2-Ziele steigen um 10 W', detail: 'Morgen bleibt locker.' },
  }),
  conditions: present({ tempC: 19, windKmh: 12 }),
  tomorrow: present({ title: 'Lockere Runde', detail: 'Fünfundvierzig Minuten, locker.', unlockLabel: missing('Keine Startzeit im morgigen Plan.') }),
  isLoading: false,
} as TodayModel

const restModel: TodayModel = {
  state: 'rest',
  dateLabel: present('MI 22 JUL'),
  streakDays: present(12),
  readiness: present({ score: 88, deltaVsYesterday: 6 }),
  readiness90DayBest: present(91),
  bodyBattery90DayHigh: missing('Noch keine 90-Tage-Historie erfasst.'),
  hrv: present({ value: 68, unit: 'ms', delta: 6, band: { low: 52, high: 74, position: 'above' } }),
  restingHr: present({ value: 48, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'below' } }),
  recentRestingHr: present([{ date: '2026-07-22', bpm: 46 }]),
  sleep: present({ totalS: 27720, deepS: 4920, remS: 6480, lightS: 15120, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 52, form: 16, series: buildPmcSeries(42) }),
  recovery: present({ hoursRemaining: 22, clearAtLabel: 'Do 17:30' }),
  bodyBattery: missing('Keine Messung seit Dienstag.'),
  session: missing('Nothing planned for today.'),
  ride: missing('No ride recorded yet today.'),
  zones: missing('No ride recorded yet today.'),
  peaks: missing('No peak-power breakdown for this ride yet.'),
  planVsRidden: missing('This ride was not matched to its plan.'),
  verdict: present({
    headline: "Absorbieren, nicht draufpacken.",
    body: "Du bist frisch — genau darum geht es. Heute ist dein Job, dir nicht im Weg zu stehen.",
  }),
  whatThisChanges: missing('The coach has not weighed in on this ride yet.'),
  conditions: missing('No location from a recent ride.'),
  tomorrow: present({ title: 'Threshold · 4 × 8 @ 285 W', detail: '', unlockLabel: missing('Keine Startzeit im morgigen Plan.') }),
  week: [
    { letter: 'M', tss: present(64) }, { letter: 'T', tss: present(48) }, { letter: 'W', tss: present(12) },
    { letter: 'T', tss: missing('Keine Fahrt erfasst.') }, { letter: 'F', tss: present(24) },
    { letter: 'S', tss: present(68) }, { letter: 'S', tss: present(44) },
  ],
  isLoading: false,
} as TodayModel

const trainingModel: TodayModel = {
  ...restModel,
  state: 'training',
  dateLabel: present('MI 22 JUL'),
  readiness: present({ score: 82, deltaVsYesterday: 4 }),
  session: present({
    title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
    blocks: [
      { label: 'Warm-up', minutes: 20, watts: 180 },
      { label: 'Interval 1', minutes: 8, watts: 285 },
      { label: 'Recover', minutes: 3, watts: 150 },
      { label: 'Interval 2', minutes: 8, watts: 285 },
      { label: 'Recover', minutes: 3, watts: 150 },
      { label: 'Interval 3', minutes: 8, watts: 285 },
      { label: 'Recover', minutes: 3, watts: 150 },
      { label: 'Interval 4', minutes: 8, watts: 285 },
      { label: 'Cool-down', minutes: 15, watts: 120 },
    ],
  }),
  conditions: present({ tempC: 13, windKmh: 14 }),
  verdict: present({
    headline: 'Green light. Go get it.',
    body: "Everything's in range. You're cleared for full intensity.",
  }),
  tomorrow: missing("Tomorrow's plan is not set yet."),
} as TodayModel

const restingModel: TodayModel = {
  state: 'resting',
  dateLabel: present('DO 23 JUL'),
  streakDays: present(13),
  readiness: present({ score: 91, deltaVsYesterday: 5 }),
  readiness90DayBest: present(94),
  bodyBattery90DayHigh: present(97),
  bodyBattery: present({ wake: 88, now: 91 }),
  hrv: present({ value: 74, unit: 'ms', delta: 10, band: { low: 52, high: 80, position: 'above' } }),
  restingHr: present({ value: 46, unit: 'bpm', delta: -4, band: { low: 44, high: 55, position: 'below' } }),
  recentRestingHr: present([{ date: '2026-07-22', bpm: 46 }]),
  sleep: present({ totalS: 29100, deepS: 5400, remS: 6600, lightS: 15900, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 42, form: 22, series: buildPmcSeries(42) }),
  recovery: present({ hoursRemaining: 0, clearAtLabel: 'Jetzt frisch' }),
  session: missing('Für heute nichts geplant.'),
  ride: missing('Heute noch keine Fahrt erfasst.'),
  zones: missing('Heute noch keine Fahrt erfasst.'),
  peaks: missing('Noch keine Spitzenleistungs-Aufschlüsselung für diese Fahrt.'),
  planVsRidden: missing('Diese Fahrt konnte nicht mit dem Plan abgeglichen werden.'),
  verdict: present({
    headline: 'Zurück auf Kurs.',
    body: 'Du bist seit dem Aufwachen um drei Punkte gestiegen. Heute bleibt nur noch, es ausklingen zu lassen.',
  }),
  whatThisChanges: missing('Der Coach hat sich zu dieser Fahrt noch nicht geäußert.'),
  conditions: missing('Kein Standort aus einer kürzlichen Fahrt.'),
  tomorrow: present({ title: 'VO2 max · 5 × 4 @ 330 W', detail: 'Fünf mal vier, bei 330.', unlockLabel: present('05:00') }),
  week: [
    { letter: 'M', tss: present(64) }, { letter: 'D', tss: present(48) }, { letter: 'M', tss: present(12) },
    { letter: 'D', tss: missing('Keine Fahrt erfasst.') }, { letter: 'F', tss: present(24) },
    { letter: 'S', tss: present(68) }, { letter: 'S', tss: present(44) },
  ],
  isLoading: false,
} as TodayModel

const eveningModel: TodayModel = {
  state: 'evening',
  dateLabel: present('DO 23 JUL'),
  streakDays: present(13),
  readiness: present({ score: 74, deltaVsYesterday: 8 }),
  readiness90DayBest: present(77),
  bodyBattery90DayHigh: missing('Noch keine 90-Tage-Historie erfasst.'),
  hrv: present({ value: 68, unit: 'ms', delta: 4, band: { low: 52, high: 74, position: 'above' } }),
  restingHr: present({ value: 46, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'in' } }),
  recentRestingHr: present([{ date: '2026-07-22', bpm: 46 }]),
  sleep: present({ totalS: 27000, deepS: 4800, remS: 5400, lightS: 15600, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 58, form: -2, series: buildPmcSeries(42) }),
  recovery: present({ hoursRemaining: 26, clearAtLabel: 'Fr 09:00' }),
  bodyBattery: missing('Keine Messung seit Dienstag.'),
  session: missing('Für heute nichts geplant.'),
  ride: present({ activityId: 1, distanceM: 84200, kj: 2130, avgHr: 138, np: 212, durationS: 10680, calories: 1842 }),
  zones: missing('Heute noch keine Fahrt erfasst.'),
  peaks: missing('Noch keine Spitzenleistungs-Aufschlüsselung für diese Fahrt.'),
  planVsRidden: missing('Diese Fahrt konnte nicht mit dem Plan abgeglichen werden.'),
  verdict: present({
    headline: 'Schütz morgen.',
    body: 'Die morgige VO2-Einheit braucht eine volle Nacht. Um 22:30 ins Bett gibt dir acht Stunden vor dem Wecker.',
  }),
  whatThisChanges: missing('Der Coach hat sich zu dieser Fahrt noch nicht geäußert.'),
  conditions: missing('Kein Standort aus einer kürzlichen Fahrt.'),
  tomorrow: present({ title: 'VO2 max · 5 × 4 @ 330 W', detail: 'Fünf mal vier, bei 330.', unlockLabel: present('05:00') }),
  week: [
    { letter: 'MO', tss: present(64) }, { letter: 'DI', tss: present(48) }, { letter: 'MI', tss: present(12) },
    { letter: 'DO', tss: missing('Keine Fahrt erfasst.') }, { letter: 'FR', tss: present(24) },
    { letter: 'SA', tss: present(68) }, { letter: 'SO', tss: present(44) },
  ],
  energyOut: missing('Kein stündlicher Energieverbrauch für heute verfügbar.'),
  isLoading: false,
} as TodayModel

describe('visual harness', () => {
  it.skipIf(!OUT)('writes the Trained screen to HTML', () => {
    writeHarness('trained', model)
  })
  it.skipIf(!OUT)('writes the Rest screen to HTML', () => {
    writeHarness('rest', restModel)
  })
  it.skipIf(!OUT)('writes the Training screen to HTML', () => {
    writeHarness('training', trainingModel)
  })
  it.skipIf(!OUT)('writes the Resting screen to HTML', () => {
    writeHarness('resting', restingModel)
  })
  it.skipIf(!OUT)('writes the Evening screen to HTML', () => {
    writeHarness('evening', eveningModel)
  })
  it.skipIf(!OUT)('writes the Session Detail screen to HTML', () => {
    writeSessionDetailHarness()
  })
})

/** Session Detail (Task 12, pen J5FV6) — its own fixture, German, run
 *  through the real `SessionDetailPage` (model prop bypasses useSessionModel
 *  so no React Query/auth/backend is needed), same "look at pixels, not just
 *  the node tree" reasoning as the Today fixtures above. */
function writeSessionDetailHarness() {
  const sessionModel: SessionModel = {
    dateLabel: present('MI 22 JUL'),
    title: present('Schwelle 4×8'),
    claim: present('Zweiunddreißig Minuten am Limit dessen, was du halten kannst.'),
    numeral: present({ text: '4×8', qualifier: 'Z4', sub: '8 MIN BLÖCKE' }),
    statWatts: present(285),
    statDurationMin: present(105),
    statTss: present(98),
    statInZoneMin: present(32),
    blocks: present([
      { key: 'warmup', name: 'AUFWÄRMEN', note: present('Z2'), minutes: 20, watts: present(180), reps: 1, isMain: false },
      { key: 'primer', name: 'ÖFFNER 3×2\'', note: present('Z3'), minutes: 6, watts: present(230), reps: 1, isMain: false },
      { key: 'block', name: 'BLOCK', note: present('Z4'), minutes: 32, watts: present(285), reps: 4, isMain: true },
      { key: 'cooldown', name: 'AUSFAHREN', note: present('Z1'), minutes: 15, watts: present(120), reps: 1, isMain: false },
    ]),
    totalDurationMin: present(105),
    totalAtThresholdMin: present(32),
    payoff: present([
      { label: 'MI', tss: present(98), isToday: true },
      { label: 'DO', tss: present(30), isToday: false },
      { label: 'FR', tss: present(45), isToday: false },
      { label: 'SA', tss: present(60), isToday: false },
      { label: 'SO', tss: present(50), isToday: false },
      { label: 'MO', tss: present(65), isToday: false },
      { label: 'DI', tss: present(70), isToday: false },
      { label: 'MI', tss: present(101), isToday: false },
    ]),
    payoffClaim: missing('Der Coach hat die nächsten sieben Tage noch nicht eingeordnet.'),
    whatThisChanges: present({
      onYou: { claim: 'Deine 12-Minuten-Decke steigt auf 288 W', detail: 'Schwellenreferenz aktualisiert.' },
      onThePlan: { claim: 'Donnerstags VO2-Ziele steigen um 10 W', detail: 'Morgen bleibt locker.' },
    }),
    routes: present([
      {
        key: 'oelberg-0', optionLetter: 'A', name: 'Ölberg Loop', distanceKm: 40, rideCount: 6,
        ascentM: present(640),
        trackPolyline: present([
          [50.678, 7.228], [50.686, 7.241], [50.694, 7.239], [50.701, 7.258],
          [50.706, 7.271], [50.699, 7.283], [50.688, 7.276], [50.680, 7.259],
        ]),
      },
      {
        key: 'rheinaue-1', optionLetter: 'B', name: 'Rheinaue Flat', distanceKm: 28, rideCount: 11,
        ascentM: present(120),
        trackPolyline: present([
          [50.702, 7.098], [50.709, 7.112], [50.712, 7.129], [50.706, 7.144],
          [50.696, 7.139], [50.690, 7.121], [50.695, 7.104],
        ]),
      },
      {
        key: 'siebengebirge-2', optionLetter: 'C', name: 'Siebengebirge Short', distanceKm: 22, rideCount: 3,
        ascentM: missing('Keine Höhenmeter für diese Strecke erfasst.'),
        trackPolyline: missing('Keine GPS-Strecke für diese Route erfasst.'),
      },
    ]),
    isLoading: false,
  }
  const { container } = render(
    <MemoryRouter>
      <SessionDetailView model={sessionModel} />
    </MemoryRouter>,
  )
  const tokens = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')
  const base = OUT!.endsWith('.html') ? OUT!.slice(0, -5) : OUT!
  writeFileSync(`${base}.session-detail.html`, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#000}${tokens}</style>
</head><body>${container.innerHTML}</body></html>`)

  const emptySessionModel: SessionModel = { ...sessionModel, routes: missing('Noch keine eigenen GPS-Strecken erfasst.') }
  const { container: emptyContainer } = render(
    <MemoryRouter>
      <SessionDetailView model={emptySessionModel} />
    </MemoryRouter>,
  )
  writeFileSync(`${base}.session-detail-no-routes.html`, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#000}${tokens}</style>
</head><body>${emptyContainer.innerHTML}</body></html>`)
}

/** `HARNESS_OUT=/tmp/t10.html` writes trained to that exact path and every
 *  other state alongside it as `/tmp/t10.<state>.html`. */
function writeHarness(name: 'trained' | 'rest' | 'training' | 'resting' | 'evening', m: TodayModel) {
  const { container } = render(<MemoryRouter><TodayView model={m} /></MemoryRouter>)
  const tokens = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')
  const base = OUT!.endsWith('.html') ? OUT!.slice(0, -5) : OUT!
  const finalPath = name === 'trained' ? OUT! : `${base}.${name}.html`
  writeFileSync(finalPath, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#000}${tokens}</style>
</head><body>${container.innerHTML}</body></html>`)
}

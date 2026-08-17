import W3TodayView, { type W3Vm } from './W3TodayView'
import { STARTER_BIKE } from './starterBike'

/**
 * TEMP preview harness — renders W3TodayView with a pen-faithful fixture so the
 * layout can be screenshot at 390px WITHOUT the backend/DB/auth. Route
 * /e/w3-today-preview is unguarded on purpose; remove before merge. The live,
 * data-wired page is W3TodayPage at /e/w3-today.
 */
const spark = (bars: number[], hi: string) => ({ bars, hi })

const FIXTURE: W3Vm = {
  handle: '@jonathan.ghost',
  tierLine: 'Silber · Woche 6 von 16',
  // The preview demos the "rider HAS a bike" hero; the empty state is what a
  // real rider sees until they render one in the studio.
  bikeName: 'Starter Bike',
  bikeImage: STARTER_BIKE,
  bikeLoading: false,
  weekDoneLabel: '4 von 6 erledigt',
  zoneTag: '88% FTP',
  avatarUrl: null,
  avatarInitial: 'J',
  streak: 17,
  readiness: 88,
  readinessWord: 'Grünes Licht',
  readinessDelta: { text: '+6 ggü. gestern', favourable: true },
  // ×1.4 is what a real 17-day streak buys under rewards.py's tier table —
  // the old "1.75×" here was above the server's hard ×1.5 ceiling.
  earnRate: '1,4×',
  earnRateWhy: '17 Tage Streak · noch 13 bis 1,5×',
  coachDate: 'Di, 12. Aug · Woche 6 von 16',
  coachLead: '88 ist grünes Licht. Dein Körper verarbeitet alles, was die heutige Einheit verlangt.',
  coachWhy: 'Alle drei Nachtwerte zeigen zum ersten Mal seit neun Tagen in dieselbe Richtung: HRV 71 ms (+9 auf den Basiswert), Ruhepuls 42 (−3), Schlaf 7:42 bei 91 Qualität.',
  hrv: { value: '71', unit: 'ms', sub: '+9 ggü. Basiswert', subHue: '#C8FF00', spark: spark([0.18, 0.45, 0.32, 0.68, 0.55, 0.82, 1], '#C8FF00') },
  rhr: { value: '42', unit: 'bpm', sub: '−3 ggü. Basiswert', subHue: '#C8FF00', spark: spark([0.32, 0.45, 0.18, 0.6, 0.72, 0.72, 1], '#C8FF00') },
  sleep: { value: '7:42', unit: 'h', sub: '91 Qualität', subHue: '#C8FF00', spark: spark([0.18, 0.55, 0.4, 1, 0.63, 0.82, 0.9], '#C8FF00') },
  weekMeta: '486 von 620 TSS',
  weekBlockLabel: 'Aufbaublock · Woche 2',
  weekDoneChip: '1 / 6 erledigt',
  weekLoadLabel: '65 von 540 TSS',
  weekGoal: { name: 'Harz Extrem Marathon · 212 km', right: 'in 8 Wochen', sub: '4. Okt' },
  planWeeks: '12 Wochen',
  weekDays: [
    { letter: 'M', num: '11', actual: 62, planned: 60, status: 'hit', title: 'Grundlage · 2 Std.', dateLabel: 'Mo, 11. Aug.', weekday: 'Montag', targetW: '205 W', ftpPct: '70%', actualDurMin: 118, actualW: 198, actualHr: 132 },
    { letter: 'D', num: '12', actual: 0, planned: 112, status: 'today', title: '4 × 8 Schwelle', dateLabel: 'Di, 12. Aug.', weekday: 'Dienstag', targetW: '285 W', ftpPct: '98%' },
    { letter: 'M', num: '13', actual: 0, planned: 45, status: 'upcoming', title: 'Erholungsfahrt', dateLabel: 'Mi, 13. Aug.', weekday: 'Mittwoch', targetW: '160 W', ftpPct: '55%' },
    { letter: 'D', num: '14', actual: 0, planned: 95, status: 'upcoming', title: 'VO₂ · 5 × 4', dateLabel: 'Do, 14. Aug.', weekday: 'Donnerstag', targetW: '330 W', ftpPct: '113%' },
    { letter: 'F', num: '15', actual: 0, planned: null, status: 'upcoming', title: null, dateLabel: 'Fr, 15. Aug.', weekday: 'Freitag', targetW: '—', ftpPct: '—' },
    { letter: 'S', num: '16', actual: 132, planned: 90, status: 'over', title: 'Gruppenfahrt', dateLabel: 'Sa, 16. Aug.', weekday: 'Samstag', targetW: '230 W', ftpPct: '79%', actualDurMin: 194, actualW: 224, actualHr: 148 },
    { letter: 'S', num: '17', actual: 28, planned: 70, status: 'missed', title: 'Tempo · 3 × 10', dateLabel: 'So, 17. Aug.', weekday: 'Sonntag', targetW: '250 W', ftpPct: '86%' },
  ],
  // A representative real day: cool windy morning, gusty warm midday, a calm
  // late-afternoon window, then a shower rolling in after 19:00. `q` values are
  // exactly what W3TodayPage.hourQuality scores these numbers, so the fixture
  // and the live page draw the same bars.
  weather: {
    window: '17:00–19:00', temp: '20°', feels: '20°',
    short: '7 km/h SW · Schauer möglich',
    verdict: 'RAUS DAMIT',
    meta: 'Bestes 2-Stunden-Fenster aus Wind, Regen und Temperatur.',
    bestFrom: 17, bestTo: 18, peak: 17,
    hours: [
      { hour: 0, q: 0.87, temp: 13, rain: 5, wind: 6, dir: 'SW', rideable: false },
      { hour: 1, q: 0.87, temp: 13, rain: 5, wind: 6, dir: 'SW', rideable: false },
      { hour: 2, q: 0.89, temp: 12, rain: 5, wind: 5, dir: 'SW', rideable: false },
      { hour: 3, q: 0.89, temp: 12, rain: 5, wind: 5, dir: 'SW', rideable: false },
      { hour: 4, q: 0.86, temp: 12, rain: 10, wind: 5, dir: 'SW', rideable: false },
      { hour: 5, q: 0.84, temp: 12, rain: 10, wind: 6, dir: 'W', rideable: false },
      { hour: 6, q: 0.82, temp: 13, rain: 10, wind: 7, dir: 'W', rideable: false },
      { hour: 7, q: 0.81, temp: 14, rain: 10, wind: 8, dir: 'W', rideable: true },
      { hour: 8, q: 0.79, temp: 15, rain: 10, wind: 9, dir: 'W', rideable: true },
      { hour: 9, q: 0.8, temp: 17, rain: 5, wind: 10, dir: 'SW', rideable: true },
      { hour: 10, q: 0.79, temp: 18, rain: 5, wind: 11, dir: 'SW', rideable: true },
      { hour: 11, q: 0.77, temp: 20, rain: 5, wind: 12, dir: 'SW', rideable: true },
      { hour: 12, q: 0.71, temp: 21, rain: 10, wind: 14, dir: 'SW', rideable: true },
      { hour: 13, q: 0.69, temp: 22, rain: 10, wind: 15, dir: 'SW', rideable: true },
      { hour: 14, q: 0.64, temp: 22, rain: 15, wind: 16, dir: 'SW', rideable: true },
      // a real gap in the feed: no readings for 15:00 — a stub bar and "—", never a guess
      { hour: 15, q: null, temp: null, rain: null, wind: null, dir: null, rideable: true },
      { hour: 16, q: 0.84, temp: 21, rain: 5, wind: 8, dir: 'SW', rideable: true },
      { hour: 17, q: 0.85, temp: 20, rain: 5, wind: 7, dir: 'SW', rideable: true },
      { hour: 18, q: 0.85, temp: 19, rain: 5, wind: 7, dir: 'W', rideable: true },
      { hour: 19, q: 0.73, temp: 18, rain: 20, wind: 9, dir: 'W', rideable: true },
      { hour: 20, q: 0.41, temp: 17, rain: 60, wind: 14, dir: 'W', rideable: true },
      { hour: 21, q: 0.31, temp: 16, rain: 70, wind: 16, dir: 'W', rideable: true },
      { hour: 22, q: 0.44, temp: 15, rain: 55, wind: 14, dir: 'W', rideable: false },
      { hour: 23, q: 0.56, temp: 15, rain: 40, wind: 12, dir: 'W', rideable: false },
    ],
  },
  mirror: {
    fitness: [0.5, 0.52, 0.55, 0.5, 0.58, 0.6, 0.62, 0.6, 0.63, 0.66, 0.62, 0.68, 0.7, 0.72, 0.7, 0.73, 0.76, 0.74, 0.78, 0.8, 0.82, 0.8, 0.83, 0.86, 0.84, 0.88, 0.9, 0.92, 0.9, 0.93, 0.96, 0.94, 0.98, 1, 0.98, 0.99, 1, 0.98, 1, 0.99, 1, 0.97],
    fatigue: [0.6, 0.55, 0.7, 0.5, 0.65, 0.72, 0.5, 0.62, 0.68, 0.55, 0.7, 0.6, 0.75, 0.52, 0.66, 0.7, 0.58, 0.72, 0.6, 0.78, 0.55, 0.68, 0.74, 0.6, 0.8, 0.58, 0.7, 0.76, 0.62, 0.82, 0.6, 0.72, 0.78, 0.64, 0.84, 0.66, 0.74, 0.8, 0.68, 0.86, 0.7, 0.75],
    fitnessRaw: Array.from({ length: 42 }, (_, i) => 40 + Math.round(i * 0.9)),
    fatigueRaw: Array.from({ length: 42 }, (_, i) => 45 + Math.round(Math.sin(i / 3) * 12)),
    todayIndex: 41,
  },
  sessionTitle: '4 × 8 Schwelle',
  sessionDur: '1 Std. 15 min',
  sessionTargetW: '285 W',
  sessionTss: '112',
  sessionFtpPct: '98%',
  sessionBlocks: [
    { w: 0.2, work: false, label: 'Einfahren · 150 W' }, { w: 0.27, work: false, label: 'Einfahren · 180 W' }, { w: 0.33, work: false, label: 'Rampe · 210 W' },
    { w: 0.77, work: true, label: 'Block 1 · 285 W' }, { w: 0.16, work: false, label: 'Erholen · 120 W' },
    { w: 0.78, work: true, label: 'Block 2 · 287 W' }, { w: 0.16, work: false, label: 'Erholen · 120 W' },
    { w: 0.79, work: true, label: 'Block 3 · 288 W' }, { w: 0.16, work: false, label: 'Erholen · 120 W' },
    { w: 0.8, work: true, label: 'Block 4 · 290 W' }, { w: 0.25, work: false, label: 'Ausfahren · 140 W' },
  ],
  sessionFtpTag: 'FTP 292 W',
  sessionEarn: 'Diese Fahrt bringt 4.200 POWER · 12 CYCLE',
  form: { fitness: 78, fatigue: 59, formVal: 19 },
  crewCaption: 'Du ziehst deinen Teil — 131 % deines eigenen Ziels und diese Woche einen Platz nach vorn. Jeder wird am eigenen Plan gemessen, niemand jagt die Watt eines Profis.',
  crew: [
    { name: 'Mara', color: '#7B5CFF', pct: 143, me: false },
    { name: 'Du', color: '#2BE68F', pct: 131, me: true },
    { name: 'Timo', color: '#6B8CFF', pct: 104, me: false },
  ],
  crewRank: '↑1',
  challengeLabel: 'CREW-CHALLENGE · UM DIE WELT',
  challengeValue: '412 / 500 km',
  challengePct: 82,
  garagePct: 68,
  garageName: 'Carbon-Rahmen',
  garageRidesLine: '17 von 25 Fahrten',
  garageMakesLine: 'Heute wird es die 18.',
  power: '625,3 Tsd.',
  cycle: '1.448',
  mRides: { pct: 50, label: '25 Fahrten' },
  mDist: { pct: 73, label: '200 km' },
}

// Mock coach adapt — mimics the persisting /workouts/today/modify result, so
// the interaction/visual can be verified WITHOUT the backend. The live page
// hits the real endpoint.
const MOCK_ADAPT = async (kind: 'easier' | 'harder' | 'shorter' | 'indoor' | 'rest') => {
  await new Promise((r) => setTimeout(r, 550))
  if (kind === 'rest') return { targetW: '—', tss: 0, ftpPct: '—', rationale: 'Heute komplette Ruhe. Lass die Belastung setzen — der Block morgen trifft dafür härter.', railsDowngraded: false, title: 'Ruhetag' }
  if (kind === 'easier') return { targetW: '255 W', tss: 92, ftpPct: '87%', rationale: 'Angepasst — 3 × 8 Schwelle. HRV ist in Ordnung, aber gestern wurde es lang — also gehen ~20 TSS runter, um den VO₂-Block am Donnerstag zu schützen.', railsDowngraded: false, title: '3 × 8 Schwelle' }
  if (kind === 'harder') return { targetW: '305 W', tss: 131, ftpPct: '104%', rationale: 'Angepasst — 4 × 9 Schwelle. Du bist frisch (TSB +19) — das bringt echte Schwellenarbeit, ohne die Ermüdung über den Plan zu treiben.', railsDowngraded: false, title: '4 × 9 Schwelle' }
  if (kind === 'shorter') return { targetW: '285 W', tss: 78, ftpPct: '98%', rationale: 'Angepasst — 4 × 6 Schwelle · 45 min. Gleiche Absicht an der Schwelle, weniger Zeit auf der Uhr.', railsDowngraded: false, title: '4 × 6 Schwelle' }
  return { targetW: '285 W', tss: 112, ftpPct: '98%', rationale: 'Angepasst — Schwelle · Indoor. Gleiche Watt auf der Rolle — Wetter und Verkehr fallen raus.', railsDowngraded: false, title: '4 × 8 Schwelle · Indoor' }
}

export default function W3TodayPreview() {
  return <W3TodayView vm={FIXTURE} onAdapt={MOCK_ADAPT} />
}

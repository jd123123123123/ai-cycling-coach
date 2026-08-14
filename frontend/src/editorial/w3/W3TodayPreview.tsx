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
  tierLine: 'Silver Tier · Week 6 of 16',
  // The preview demos the "rider HAS a bike" hero; the empty state is what a
  // real rider sees until they render one in the studio.
  bikeName: 'Starter Bike',
  bikeImage: STARTER_BIKE,
  bikeLoading: false,
  weekDoneLabel: '4 of 6 done',
  zoneTag: '88% FTP',
  avatarUrl: null,
  avatarInitial: 'J',
  streak: 17,
  readiness: 88,
  readinessWord: 'Green light',
  readinessDelta: { text: '+6 vs yesterday', favourable: true },
  // ×1.4 is what a real 17-day streak buys under rewards.py's tier table —
  // the old "1.75×" here was above the server's hard ×1.5 ceiling.
  earnRate: '1.4×',
  earnRateWhy: '17-day streak · 13 to 1.5×',
  coachDate: 'Tue 12 Aug · Week 6 of 16',
  coachLead: '88 is a green light. Your body will absorb everything today’s session asks of it.',
  coachWhy: 'All three overnight signals moved the same way for the first time in nine days: HRV 71 ms (+9 on baseline), resting HR 42 (−3), sleep 7:42 at 91 quality.',
  hrv: { value: '71', unit: 'ms', sub: '+9 vs baseline', subHue: '#C8FF00', spark: spark([0.18, 0.45, 0.32, 0.68, 0.55, 0.82, 1], '#C8FF00') },
  rhr: { value: '42', unit: 'bpm', sub: '−3 vs baseline', subHue: '#C8FF00', spark: spark([0.32, 0.45, 0.18, 0.6, 0.72, 0.72, 1], '#C8FF00') },
  sleep: { value: '7:42', unit: 'hrs', sub: '91 quality', subHue: '#C8FF00', spark: spark([0.18, 0.55, 0.4, 1, 0.63, 0.82, 0.9], '#C8FF00') },
  weekMeta: '486 of 620 TSS',
  weekBlockLabel: 'Aufbaublock · Woche 2',
  weekDoneChip: '1 / 6 erledigt',
  weekLoadLabel: '65 von 540 TSS',
  weekGoal: { name: 'Harz Extrem Marathon · 212 km', right: 'in 8 Wochen', sub: '4. Okt' },
  planWeeks: '12 Wochen',
  weekDays: [
    { letter: 'M', num: '11', actual: 62, planned: 60, status: 'hit', title: 'Endurance · 2h', dateLabel: 'Mo, 11. Aug.', weekday: 'Montag', targetW: '205 W', ftpPct: '70%', actualDurMin: 118, actualW: 198, actualHr: 132 },
    { letter: 'D', num: '12', actual: 0, planned: 112, status: 'today', title: '4 × 8 Threshold', dateLabel: 'Di, 12. Aug.', weekday: 'Dienstag', targetW: '285 W', ftpPct: '98%' },
    { letter: 'M', num: '13', actual: 0, planned: 45, status: 'upcoming', title: 'Recovery spin', dateLabel: 'Mi, 13. Aug.', weekday: 'Mittwoch', targetW: '160 W', ftpPct: '55%' },
    { letter: 'D', num: '14', actual: 0, planned: 95, status: 'upcoming', title: 'VO₂ · 5 × 4', dateLabel: 'Do, 14. Aug.', weekday: 'Donnerstag', targetW: '330 W', ftpPct: '113%' },
    { letter: 'F', num: '15', actual: 0, planned: null, status: 'upcoming', title: null, dateLabel: 'Fr, 15. Aug.', weekday: 'Freitag', targetW: '—', ftpPct: '—' },
    { letter: 'S', num: '16', actual: 132, planned: 90, status: 'over', title: 'Group ride', dateLabel: 'Sa, 16. Aug.', weekday: 'Samstag', targetW: '230 W', ftpPct: '79%', actualDurMin: 194, actualW: 224, actualHr: 148 },
    { letter: 'S', num: '17', actual: 28, planned: 70, status: 'missed', title: 'Tempo · 3 × 10', dateLabel: 'So, 17. Aug.', weekday: 'Sonntag', targetW: '250 W', ftpPct: '86%' },
  ],
  weather: {
    window: '16:00–18:00', temp: '19°', feels: '17°',
    short: '8 km/h SW · trocken',
    verdict: 'GO OUTSIDE',
    meta: 'Bestes 2-Stunden-Fenster aus Wind, Regen und Temperatur.',
  },
  mirror: {
    fitness: [0.5, 0.52, 0.55, 0.5, 0.58, 0.6, 0.62, 0.6, 0.63, 0.66, 0.62, 0.68, 0.7, 0.72, 0.7, 0.73, 0.76, 0.74, 0.78, 0.8, 0.82, 0.8, 0.83, 0.86, 0.84, 0.88, 0.9, 0.92, 0.9, 0.93, 0.96, 0.94, 0.98, 1, 0.98, 0.99, 1, 0.98, 1, 0.99, 1, 0.97],
    fatigue: [0.6, 0.55, 0.7, 0.5, 0.65, 0.72, 0.5, 0.62, 0.68, 0.55, 0.7, 0.6, 0.75, 0.52, 0.66, 0.7, 0.58, 0.72, 0.6, 0.78, 0.55, 0.68, 0.74, 0.6, 0.8, 0.58, 0.7, 0.76, 0.62, 0.82, 0.6, 0.72, 0.78, 0.64, 0.84, 0.66, 0.74, 0.8, 0.68, 0.86, 0.7, 0.75],
    fitnessRaw: Array.from({ length: 42 }, (_, i) => 40 + Math.round(i * 0.9)),
    fatigueRaw: Array.from({ length: 42 }, (_, i) => 45 + Math.round(Math.sin(i / 3) * 12)),
    todayIndex: 41,
  },
  sessionTitle: '4 × 8 Threshold',
  sessionDur: '1h 15m',
  sessionTargetW: '285 W',
  sessionTss: '112',
  sessionFtpPct: '98%',
  sessionBlocks: [
    { w: 0.2, work: false, label: 'Warm-up · 150 W' }, { w: 0.27, work: false, label: 'Warm-up · 180 W' }, { w: 0.33, work: false, label: 'Ramp · 210 W' },
    { w: 0.77, work: true, label: 'Block 1 · 285 W' }, { w: 0.16, work: false, label: 'Recover · 120 W' },
    { w: 0.78, work: true, label: 'Block 2 · 287 W' }, { w: 0.16, work: false, label: 'Recover · 120 W' },
    { w: 0.79, work: true, label: 'Block 3 · 288 W' }, { w: 0.16, work: false, label: 'Recover · 120 W' },
    { w: 0.8, work: true, label: 'Block 4 · 290 W' }, { w: 0.25, work: false, label: 'Cool-down · 140 W' },
  ],
  sessionFtpTag: 'FTP 292 W',
  sessionEarn: 'This ride earns 4,200 POWER · 12 CYCLE',
  form: { fitness: 78, fatigue: 59, formVal: 19 },
  crewCaption: "You're pulling your weight — 131% of your own target, and up a place this week. Everyone's scored against their own plan, so nobody's chasing a pro's watts.",
  crew: [
    { name: 'Mara', color: '#7B5CFF', pct: 143, me: false },
    { name: 'You', color: '#2BE68F', pct: 131, me: true },
    { name: 'Timo', color: '#6B8CFF', pct: 104, me: false },
  ],
  crewRank: '↑1',
  challengeLabel: 'CREW-CHALLENGE · AROUND THE WORLD',
  challengeValue: '412 / 500 km',
  challengePct: 82,
  garagePct: 68,
  garageName: 'Carbon frame',
  garageRidesLine: '17 of 25 rides',
  garageMakesLine: "Today's session makes 18",
  power: '625.3K',
  cycle: '1,448',
  mRides: { pct: 50, label: '25 rides' },
  mDist: { pct: 73, label: '200 km' },
}

// Mock coach adapt — mimics the persisting /workouts/today/modify result, so
// the interaction/visual can be verified WITHOUT the backend. The live page
// hits the real endpoint.
const MOCK_ADAPT = async (kind: 'easier' | 'harder' | 'shorter' | 'indoor' | 'rest') => {
  await new Promise((r) => setTimeout(r, 550))
  if (kind === 'rest') return { targetW: '—', tss: 0, ftpPct: '—', rationale: 'Full rest today. Let the load settle — tomorrow’s block hits harder for it.', railsDowngraded: false, title: 'Rest day' }
  if (kind === 'easier') return { targetW: '255 W', tss: 92, ftpPct: '87%', rationale: 'Adjusted — 3 × 8 Threshold. HRV is fine but yesterday ran long, so ~20 TSS came off to protect Thursday’s VO₂ block.', railsDowngraded: false, title: '3 × 8 Threshold' }
  if (kind === 'harder') return { targetW: '305 W', tss: 131, ftpPct: '104%', rationale: 'Adjusted — 4 × 9 Threshold. You’re fresh (TSB +19) — this banks real threshold work without spiking fatigue past the plan.', railsDowngraded: false, title: '4 × 9 Threshold' }
  if (kind === 'shorter') return { targetW: '285 W', tss: 78, ftpPct: '98%', rationale: 'Adjusted — 4 × 6 Threshold · 45 min. Same threshold intent, less time on the clock.', railsDowngraded: false, title: '4 × 6 Threshold' }
  return { targetW: '285 W', tss: 112, ftpPct: '98%', rationale: 'Adjusted — Threshold · Indoor. Same watts on the trainer — weather and traffic out of the equation.', railsDowngraded: false, title: '4 × 8 Threshold · Indoor' }
}

export default function W3TodayPreview() {
  return <W3TodayView vm={FIXTURE} onAdapt={MOCK_ADAPT} />
}

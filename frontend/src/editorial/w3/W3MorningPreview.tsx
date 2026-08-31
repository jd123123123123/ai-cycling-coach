import W3MorningSheet from './W3MorningSheet'
import type { MorningBriefing } from './useMorningBriefing'

/**
 * `/e/w3-morning-preview` — the briefing without a session, so the layout can
 * be looked at.
 *
 * `?rest` is the day the plan says not to ride (no ride window — a best
 * two-hour slot on a rest day is an invitation to ignore the plan), and
 * `?stale` is the morning the watch has not synced, which is the state this
 * sheet is most likely to be wrong in: it opens before the sync lands, so it is
 * the surface most tempted to print yesterday's score as today's.
 */

const FULL: MorningBriefing = {
  greeting: 'Guten Morgen, Jannis',
  welcome: 'Die Nacht war lang genug.',
  readinessVerdict: 'Solide Basis',
  contributors: [
    { key: 'sleep', sentence: 'Volle Nacht', label: 'Schlaf', value: '7:24 h', at: 0.74,
      band: { lo: 0.7, hi: 0.9 }, bandLabel: '7–9 h', tone: 'good', dir: 'up' },
    { key: 'deep', sentence: 'Gesunder Tiefschlaf', label: 'Tiefschlaf', value: '96 min', at: 0.62,
      band: { lo: 0.37, hi: 0.66 }, bandLabel: '13–23 %', tone: 'good', dir: 'flat' },
    { key: 'hrv', sentence: 'HRV über deinem Bereich', label: 'HRV', value: '68 ms', at: 0.78,
      band: { lo: 0.31, hi: 0.69 }, bandLabel: '54–63 ms', tone: 'good', dir: 'up' },
    { key: 'rhr', sentence: 'Ruhepuls niedriger — erholt', label: 'Ruhepuls', value: '46 bpm', at: 0.18,
      band: { lo: 0.31, hi: 0.69 }, bandLabel: '48–53 bpm', tone: 'good', dir: 'down' },
  ],
  dateLabel: 'Donnerstag, 27. August',
  headline: 'Schwellenintervalle',
  headlineMeta: '75 min',
  blocks: [
    { label: 'Einfahren', minutes: 15, watts: 150 },
    { label: '4 × 8 @ Schwelle', minutes: 8, watts: 268 },
    { label: 'Pause', minutes: 4, watts: 120 },
    { label: '4 × 8 @ Schwelle', minutes: 8, watts: 268 },
    { label: 'Pause', minutes: 4, watts: 120 },
    { label: '4 × 8 @ Schwelle', minutes: 8, watts: 272 },
    { label: 'Pause', minutes: 4, watts: 120 },
    { label: '4 × 8 @ Schwelle', minutes: 8, watts: 274 },
    { label: 'Ausfahren', minutes: 16, watts: 135 },
  ],
  // NULL on a normal morning: the ring already says 74 and carries its own
  // delta, and form is drawn in block 04. This field exists only for the
  // morning the ring CANNOT be drawn — see `?stale`.
  why: null,
  tone: 'go',
  window: {
    label: '08:00–10:00', detail: '14° · 11 km/h NW · trocken', verdict: 'RAUS DAMIT',
    bestFrom: 8, bestTo: 9,
    hours: [
      { hour: 7, q: 0.82, rideable: true, rain: 5, wind: 9, dir: 'NW', temp: 11 },
      { hour: 8, q: 0.88, rideable: true, rain: 0, wind: 11, dir: 'NW', temp: 13 },
      { hour: 9, q: 0.91, rideable: true, rain: 0, wind: 12, dir: 'NW', temp: 14 },
      { hour: 10, q: 0.86, rideable: true, rain: 5, wind: 14, dir: 'W', temp: 16 },
      { hour: 11, q: 0.74, rideable: true, rain: 15, wind: 16, dir: 'W', temp: 17 },
      { hour: 12, q: 0.62, rideable: true, rain: 25, wind: 19, dir: 'W', temp: 18 },
      { hour: 13, q: 0.44, rideable: true, rain: 55, wind: 22, dir: 'SW', temp: 18 },
      { hour: 14, q: 0.31, rideable: true, rain: 70, wind: 24, dir: 'SW', temp: 17 },
      { hour: 15, q: 0.28, rideable: true, rain: 75, wind: 23, dir: 'SW', temp: 16 },
      { hour: 16, q: 0.36, rideable: true, rain: 60, wind: 20, dir: 'S', temp: 16 },
      { hour: 17, q: 0.52, rideable: true, rain: 35, wind: 17, dir: 'S', temp: 15 },
      { hour: 18, q: 0.63, rideable: true, rain: 20, wind: 14, dir: 'SE', temp: 14 },
      { hour: 19, q: 0.7, rideable: true, rain: 10, wind: 12, dir: 'SE', temp: 13 },
      { hour: 20, q: 0.66, rideable: true, rain: 10, wind: 11, dir: 'E', temp: 12 },
      { hour: 21, q: 0.58, rideable: true, rain: 15, wind: 10, dir: 'E', temp: 11 },
    ],
  },
  readiness: { score: 74, delta: 6 },
  // A stand-in landscape so the poster treatment can be looked at without a
  // session; the real screen puts the rider's own composed scene here.
  heroImage: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23415A77'/%3E%3Cstop offset='60%25' stop-color='%231B263B'/%3E%3Cstop offset='100%25' stop-color='%230D1B2A'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='300' fill='url(%23g)'/%3E%3Cpath d='M0 210 L90 150 L150 195 L240 120 L320 180 L400 140 L400 300 L0 300 Z' fill='%23101820'/%3E%3C/svg%3E",
  celebration: {
    title: 'Solide Basis.',
    body: 'Genug im Tank für den Plan. Kein Grund zur Vorsicht, kein Grund zum Übermut.',
    crowned: false,
  },
  night: {
    totalLabel: '7:24 h',
    stages: [
      { key: 'deep', label: 'TIEF', minutes: 96 },
      { key: 'rem', label: 'REM', minutes: 104 },
      { key: 'light', label: 'LEICHT', minutes: 218 },
      { key: 'awake', label: 'WACH', minutes: 26 },
    ],
    hrv: { value: '68 ms', delta: 4, position: 'above' },
    rhr: { value: '46 bpm', delta: -2, position: 'below' },
    battery: 82,
  },
  body: {
    yesterdayTss: 78,
    fatigueDrop: 4.2,
    form: -6,
    formSeries: [
      { date: '2026-08-01', tsb: -24 },
      { date: '2026-08-02', tsb: -26 },
      { date: '2026-08-03', tsb: -23 },
      { date: '2026-08-04', tsb: -25 },
      { date: '2026-08-05', tsb: -21 },
      { date: '2026-08-06', tsb: -19 },
      { date: '2026-08-07', tsb: -22 },
      { date: '2026-08-08', tsb: -18 },
      { date: '2026-08-09', tsb: -16 },
      { date: '2026-08-10', tsb: -17 },
      { date: '2026-08-11', tsb: -13 },
      { date: '2026-08-12', tsb: -11 },
      { date: '2026-08-13', tsb: -14 },
      { date: '2026-08-14', tsb: -10 },
      { date: '2026-08-15', tsb: -8 },
      { date: '2026-08-16', tsb: -9 },
      { date: '2026-08-17', tsb: -12 },
      { date: '2026-08-18', tsb: -9 },
      { date: '2026-08-19', tsb: -7 },
      { date: '2026-08-20', tsb: -5 },
      { date: '2026-08-21', tsb: -8 },
      { date: '2026-08-22', tsb: -6 },
      { date: '2026-08-23', tsb: -4 },
      { date: '2026-08-24', tsb: -2 },
      { date: '2026-08-25', tsb: -5 },
      { date: '2026-08-26', tsb: -3 },
      { date: '2026-08-27', tsb: -7 },
      { date: '2026-08-28', tsb: -6 },
    ],
    week: [
      { letter: 'M', tss: 62 }, { letter: 'D', tss: null }, { letter: 'M', tss: 95 },
      { letter: 'D', tss: 78 }, { letter: 'F', tss: null }, { letter: 'S', tss: null }, { letter: 'S', tss: null },
    ],
    weekSpent: 235,
    weekPlanned: 480,
  },
  streak: '12 Tage in Folge',
  bare: false,
}

const REST: MorningBriefing = {
  ...FULL,
  headline: 'Ruhetag',
  headlineMeta: null,
  why: 'Noch 14 h Erholung bis 21:00. Der Block hat gestern zugeschlagen.',
  tone: 'rest',
  window: null,
  streak: null,
}

/** The morning the watch has not synced — no score, and the sheet says so
 *  rather than borrowing yesterday's. */
const STALE: MorningBriefing = {
  ...FULL,
  celebration: null,
  readinessVerdict: null,
  contributors: [],
  welcome: null,
  readiness: null,
  // The watch has produced nothing overnight — so there is no night to draw,
  // and the sheet must not borrow the last one it saw.
  night: null,
  headline: 'Grundlage 2',
  headlineMeta: '90 min',
  why: 'Seit 3 Tagen keine Nacht-Werte — der Plan gilt trotzdem.',
  tone: 'easy',
  streak: null,
}

export default function W3MorningPreview() {
  const q = typeof window !== 'undefined' ? window.location.search : ''
  const briefing = q.includes('rest') ? REST : q.includes('stale') ? STALE : FULL
  return <W3MorningSheet briefing={briefing} onClose={() => {}} onToday={() => {}} />
}

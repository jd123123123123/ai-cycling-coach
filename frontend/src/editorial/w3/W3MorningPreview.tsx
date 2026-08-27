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
  welcome: '7,4 Stunden Schlaf — damit lässt sich was anfangen.',
  dateLabel: 'Donnerstag, 27. August',
  headline: 'Schwellenintervalle',
  headlineMeta: '75 min',
  why: 'Deine Bereitschaft liegt bei 74 (+6 zu gestern). Deine Form ist frisch.',
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
    note: '96 min Tiefschlaf, deine HRV lag über deinem Bereich, dein Ruhepuls war niedriger als sonst.',
  },
  body: {
    yesterdayTss: 78,
    fatigueDrop: 4.2,
    form: -6,
    week: [
      { letter: 'M', tss: 62 }, { letter: 'D', tss: null }, { letter: 'M', tss: 95 },
      { letter: 'D', tss: 78 }, { letter: 'F', tss: null }, { letter: 'S', tss: null }, { letter: 'S', tss: null },
    ],
    weekSpent: 235,
    weekPlanned: 480,
    note: 'Über Nacht hat dein Körper 4.2 Ermüdung abgebaut, gestern hast du 78 TSS eingefahren.',
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

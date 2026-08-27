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
  dateLabel: 'Donnerstag, 27. August',
  headline: 'Schwellenintervalle',
  headlineMeta: '75 min',
  why: 'Deine Bereitschaft liegt bei 74 (+6 zu gestern). Deine Form ist frisch.',
  tone: 'go',
  window: {
    label: '08:00–10:00', detail: '14° · 11 km/h NW · trocken', verdict: 'RAUS DAMIT',
    bestFrom: 8, bestTo: 9,
    hours: [
    { hour: 7, q: 0.82, rideable: true },
    { hour: 8, q: 0.88, rideable: true },
    { hour: 9, q: 0.91, rideable: true },
    { hour: 10, q: 0.86, rideable: true },
    { hour: 11, q: 0.74, rideable: true },
    { hour: 12, q: 0.62, rideable: true },
    { hour: 13, q: 0.44, rideable: true },
    { hour: 14, q: 0.31, rideable: true },
    { hour: 15, q: 0.28, rideable: true },
    { hour: 16, q: 0.36, rideable: true },
    { hour: 17, q: 0.52, rideable: true },
    { hour: 18, q: 0.63, rideable: true },
    { hour: 19, q: 0.7, rideable: true },
    { hour: 20, q: 0.66, rideable: true },
    { hour: 21, q: 0.58, rideable: true },
    ],
  },
  readiness: { score: 74, delta: 6 },
  readings: [
    { key: 'sleep', label: 'SCHLAF', value: '7:24 h', note: '96 min tief' },
    { key: 'hrv', label: 'HRV', value: '68 ms', note: '+4' },
    { key: 'bb', label: 'AKKU', value: '82', note: 'beim Aufwachen' },
  ],
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
  readiness: null,
  headline: 'Grundlage 2',
  headlineMeta: '90 min',
  why: 'Seit 3 Tagen keine Nacht-Werte — der Plan gilt trotzdem.',
  tone: 'easy',
  readings: [],
  streak: null,
}

export default function W3MorningPreview() {
  const q = typeof window !== 'undefined' ? window.location.search : ''
  const briefing = q.includes('rest') ? REST : q.includes('stale') ? STALE : FULL
  return <W3MorningSheet briefing={briefing} onClose={() => {}} onToday={() => {}} />
}

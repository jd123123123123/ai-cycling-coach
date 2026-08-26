import { useState } from 'react'
import W3CrewView, { type W3CrewVm } from './W3CrewView'
import { W3CrewFeedView } from './W3CrewFeed'
import type { CrewRide } from '../../api/crewRides'
import { periodWord, thisPeriod, type W3Period } from './w3crew'

/**
 * TEMP preview — /e/w3-crew-preview (unguarded). A design fixture for the crew
 * board in the spirit of the pen's "Nachtschicht CC" frame `WAjw9`; the wired
 * `W3CrewPage` fills all of it from real crew standings.
 *
 * The period control is live so the layout is inspectable on every tab, but the
 * FIXTURE NUMBERS DO NOT CHANGE with it — only the wired page re-fetches.
 */

/** Fixture rides for chapter 03, so the feed is reviewable without a backend.
 *  The wired screen reads the crew's real ones. */
const H = 3600
const now = Date.now()
const FEED_RIDES: CrewRide[] = [
  { id: 901, user_id: 2, handle: 'mara', display_name: 'Mara', title: 'Feierabendrunde am Kanal', started_at: new Date(now - 5 * H * 1000).toISOString(),
    distance_m: 48200, elevation_gain_m: 310, duration_seconds: 5820, sport: 'cycling', tss: 78, avg_power_w: 212, avg_hr: 148,
    calories: 1180, is_mine: false, comment_count: 2, reactions: { counts: { '🔥': 3, '💪': 1 }, mine: ['💪'] } },
  { id: 902, user_id: 1, handle: 'du', display_name: 'Du', title: 'Intervalle, 4×8', started_at: new Date(now - 26 * H * 1000).toISOString(),
    distance_m: 62400, elevation_gain_m: 680, duration_seconds: 7980, sport: 'cycling', tss: 121, avg_power_w: 241, avg_hr: 156,
    calories: 1640, is_mine: true, comment_count: 1, reactions: { counts: { '🚀': 2 }, mine: [] } },
  { id: 903, user_id: 3, handle: 'timo', display_name: 'Timo', title: 'Lange Ausfahrt in die Berge', started_at: new Date(now - 50 * H * 1000).toISOString(),
    distance_m: 118600, elevation_gain_m: 1840, duration_seconds: 16200, sport: 'cycling', tss: 214, avg_power_w: 198, avg_hr: 141,
    calories: 3120, is_mine: false, comment_count: 0, reactions: { counts: { '👏': 4, '⚡': 2 }, mine: [] } },
  // A ride imported without a power meter — the card must print DASH, not a
  // padded zero. Worth having in the fixture precisely because it is the case
  // that looks wrong when it is wrong.
  { id: 904, user_id: 4, handle: 'jo', display_name: 'Jo', title: 'Regeneration', started_at: new Date(now - 74 * H * 1000).toISOString(),
    distance_m: 24100, elevation_gain_m: 90, duration_seconds: 3600, sport: 'cycling', tss: null, avg_power_w: null, avg_hr: 118,
    calories: 620, is_mine: false, comment_count: 0, reactions: { counts: {}, mine: [] } },
  { id: 905, user_id: 2, handle: 'mara', display_name: 'Mara', title: 'Rolle, Sweetspot', started_at: new Date(now - 98 * H * 1000).toISOString(),
    distance_m: 31000, elevation_gain_m: 0, duration_seconds: 4200, sport: 'cycling', tss: 68, avg_power_w: 205, avg_hr: 144,
    calories: 840, is_mine: false, comment_count: 3, reactions: { counts: { '🙌': 1 }, mine: [] } },
]

const BASE = {
  inCrew: true,
  crewName: 'Nachtschicht CC',
  blurb: 'Each rider is scored against their own weekly plan — so a short week and a big week sit on the same board.',
  windowChip: 'AUG 10–16',
  rankOrdinal: '2nd',
  propsHint: 'Three a week. Spend them on the effort, not the number.',
  crewTss: '2,140',
  crewKm: '412 km',
  crewTotals: [
    { key: 'km', value: '412', unit: 'km', label: 'ZUSAMMEN GEFAHREN' },
    { key: 'h', value: '22', unit: 'h', label: 'IM SATTEL' },
    { key: 'tss', value: '2.140', label: 'CREW TSS' },
  ],
  crewKmCoverage: null,
  avgTss: '357',
  yourShare: '19%',
  outputNote: 'Points are each rider’s share of their own weekly bar. TSS and kilometres are the raw totals for this window.',
  members: [
    { id: 1, name: '@mara', rank: 1, tssLabel: '486', kmLabel: '121 km', pct: 143, isYou: false , hoursLabel: '6,1 h' },
    { id: 2, name: 'You', rank: 2, tssLabel: '412', kmLabel: '84 km', pct: 131, isYou: true , hoursLabel: '4,3 h' },
    { id: 3, name: '@timo', rank: 3, tssLabel: '351', kmLabel: '78 km', pct: 104, isYou: false , hoursLabel: '3,9 h' },
    { id: 4, name: '@jonas', rank: 4, tssLabel: '318', kmLabel: '61 km', pct: 96, isYou: false , hoursLabel: '3,2 h' },
    { id: 5, name: '@lena', rank: 5, tssLabel: '294', kmLabel: '43 km', pct: 88, isYou: false , hoursLabel: '2,4 h' },
    { id: 6, name: '@ilker', rank: 6, tssLabel: '279', kmLabel: '25 km', pct: 61, isYou: false , hoursLabel: '1,6 h' },
  ],
  showedUp: [
    { id: 1, name: '@mara', isYou: false, days: [true, false, false, true, false, true, false] },
    { id: 2, name: 'You', isYou: true, days: [true, true, false, true, false, true, true] },
    { id: 3, name: '@timo', isYou: false, days: [false, true, false, false, true, false, true] },
    { id: 4, name: '@jonas', isYou: false, days: [true, false, false, true, false, true, false] },
    { id: 5, name: '@lena', isYou: false, days: [false, true, false, true, false, false, true] },
    { id: 6, name: '@ilker', isYou: false, days: [false, false, true, false, false, true, false] },
  ],
  showedUpFilled: 21,
  showedUpTotal: 42,
  showedUpNote: 'A filled block is a day a rider actually logged a session.',
  gridEdges: null,
  distanceKm: 412,
  distanceGoalKm: 500,
  distancePct: 82,
  distanceToGo: 88,
  yourDistanceNote: "You've put in 84 km — more than four of the six",
  yourSharePct: 20,
  highlights: [
    { id: 'h1', name: '@mara', isYou: false, text: 'Leads the crew board this week', badge: '860 PTS' },
    { id: 'h2', name: 'You', isYou: true, text: '412 TSS · 84 km this week', badge: '2ND' },
    { id: 'h3', name: '@timo', isYou: false, text: 'Showed up in 3 of 7 days', badge: '3/7' },
  ],
  seatsOpen: 2,
  seatsCopy: 'Crews of six to eight hold each other best. Fewer, and a quiet week goes unnoticed.',
}

export default function W3CrewPreview() {
  const [period, setPeriod] = useState<W3Period>('week')
  const vm: W3CrewVm = {
    ...BASE,
    period,
    rankSub: `of six ${thisPeriod(period)}`,
    crewTssSub: `six riders · ${thisPeriod(period)}`,
    gridDow: period === 'week',
    showDistanceGoal: period === 'week',
    highlightsTitle: `This ${periodWord(period)} in the crew`,
  }
  return <W3CrewView vm={vm} onPeriod={setPeriod}
    feed={<W3CrewFeedView rides={FEED_RIDES} variant="page" />} />
}

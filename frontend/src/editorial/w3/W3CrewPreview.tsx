import { useState } from 'react'
import W3CrewView, { type W3CrewVm } from './W3CrewView'
import { periodWord, thisPeriod, type W3Period } from './w3crew'

/**
 * TEMP preview — /e/w3-crew-preview (unguarded). A design fixture for the crew
 * board in the spirit of the pen's "Nachtschicht CC" frame `WAjw9`; the wired
 * `W3CrewPage` fills all of it from real crew standings.
 *
 * The period control is live so the layout is inspectable on every tab, but the
 * FIXTURE NUMBERS DO NOT CHANGE with it — only the wired page re-fetches.
 */

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
  return <W3CrewView vm={vm} onPeriod={setPeriod} />
}

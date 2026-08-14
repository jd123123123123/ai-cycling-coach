import { useState } from 'react'
import W3CrewMemberView, { type W3CrewMemberVm } from './W3CrewMemberView'
import { AVATAR_TINTS, periodWord, thisPeriod, type W3Period } from './w3crew'

/**
 * TEMP preview — /e/w3-crew-member-preview (unguarded). A design fixture of the
 * crew-member detail in the REFERRAL USER DETAIL language, including a rider
 * whose VO2max is missing so the "—" treatment is inspectable. The wired
 * `W3CrewMemberPage` fills every value from that rider's real standings row.
 *
 * The period control is live for layout inspection only — these fixture numbers
 * do not change with it.
 */

const BASE = {
  found: true,
  handle: '@mara',
  isYou: false,
  tint: AVATAR_TINTS[0],
  windowChip: 'AUG 10–16',
  headline: '486',
  stats: [
    { key: 'km', icon: 'route' as const, label: 'DISTANCE', value: '121 km' },
    { key: 'active', icon: 'calendar' as const, label: 'ACTIVE DAYS', value: '4 / 7' },
    { key: 'points', icon: 'sparkles' as const, label: 'CREW POINTS', value: '860' },
    { key: 'bar', icon: 'gauge' as const, label: 'OWN WEEK BAR', value: '112%' },
    { key: 'wkg', icon: 'zap' as const, label: 'W/KG AT FTP', value: '3.81', note: 'from their profile, not this window' },
    { key: 'vo2', icon: 'heart' as const, label: 'VO2MAX', value: '—', note: 'latest estimate on or before the window end', missing: true },
  ],
  bars: [0.8, 0, 0, 1, 0, 0.62, 0.1],
  barsFilled: 4,
  barsTotal: 7,
  barsEdges: { left: 'AUG 10', right: 'AUG 16' },
  vsYou: [
    { label: 'TSS', value: '+74 TSS', ahead: true },
    { label: 'Crew points', value: '+120 pts', ahead: true },
    { label: 'Kilometres', value: '+37 km', ahead: true },
  ],
  footnote: 'Points are each rider’s share of their OWN weekly bar (their four-week average weekly TSS × 1.05), so the board weighs effort against plan rather than raw volume. TSS and kilometres are the untouched totals for this window; a dash means the app has no source for that number.',
  missingCopy: '',
}

export default function W3CrewMemberPreview() {
  const [period, setPeriod] = useState<W3Period>('week')
  const vm: W3CrewMemberVm = {
    ...BASE,
    period,
    rankLine: `1st of six · ${thisPeriod(period)}`,
    headlineKicker: `TSS · ${thisPeriod(period).toUpperCase()}`,
    headlineSub: `23% of the crew's 2,140 TSS ${thisPeriod(period)}`,
    barsNote: `Each bar is one day; the tallest is their biggest day of the ${periodWord(period)}.`,
    vsYouNote: `74 TSS ahead of you ${thisPeriod(period)}.`,
  }
  return <W3CrewMemberView vm={vm} onPeriod={setPeriod} />
}

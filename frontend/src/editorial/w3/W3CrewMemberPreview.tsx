import { useState } from 'react'
import W3CrewMemberView, { type W3CrewMemberVm } from './W3CrewMemberView'
import { AVATAR_TINTS, thisPeriod, type W3Period } from './w3crew'

/**
 * TEMP preview — /e/w3-crew-member-preview (unguarded). A design fixture of the
 * crew-member detail: the DUEL as centrepiece, a rider whose VO2max is missing
 * so the "—" treatment is inspectable, and a ride list whose feed coverage is
 * complete. The wired `W3CrewMemberPage` fills every value from that rider's
 * real standings row plus their rows in the crew ride feed.
 *
 * The period control is live for layout inspection only — these fixture numbers
 * do not change with it.
 */

const BASE = {
  found: true,
  handle: '@mara',
  isYou: false,
  tint: AVATAR_TINTS[0],
  windowChip: '10.–16. AUG',
  headline: '486',
  stats: [
    { key: 'km', icon: 'route' as const, label: 'DISTANZ', value: '121 km' },
    { key: 'active', icon: 'calendar' as const, label: 'AKTIVE TAGE', value: '4 / 7' },
    { key: 'points', icon: 'sparkles' as const, label: 'CREW-PUNKTE', value: '860' },
    { key: 'bar', icon: 'gauge' as const, label: 'EIGENES WOCHENZIEL', value: '112 %' },
    { key: 'wkg', icon: 'zap' as const, label: 'W/KG AN FTP', value: '3,81', note: 'aus dem Profil, nicht aus diesem Fenster' },
    { key: 'vo2', icon: 'heart' as const, label: 'VO2MAX', value: '—', note: 'letzter Schätzwert bis Fensterende', missing: true },
  ],
  bars: [0.8, 0, 0, 1, 0, 0.62, 0.1],
  barsFilled: 4,
  barsTotal: 7,
  barsEdges: { left: '10. AUG', right: '16. AUG' },
  barsNote: 'Ein Balken ist ein Tag. Der höchste ist der stärkste Tag in diesem Fenster.',
  rides: {
    countChip: '4 FAHRTEN',
    rides: [
      { id: 4, date: 'Sa · 16. Aug', title: 'Lange Runde am Ammersee', distance: '82 km', meta: '2:54 h · 640 hm', distancePct: 1 },
      { id: 3, date: 'Do · 14. Aug', title: 'Intervalle 4×8', distance: '41 km', meta: '1:22 h · 210 hm', distancePct: 0.5 },
      { id: 2, date: 'Di · 12. Aug', title: 'Pendeln', distance: '18 km', meta: '38 min', distancePct: 0.22 },
      { id: 1, date: 'So · 10. Aug', title: 'Rolle', distance: '—', meta: '1:05 h', distancePct: 0 },
    ],
    note: 'Jede Fahrt aus diesem Fenster, wie sie im Crew-Feed steht.',
    empty: null,
  },
  footnote: 'Punkte sind der Anteil am EIGENEN Wochenziel jedes Fahrers (Ø Wochen-TSS der letzten vier Wochen × 1,05). Das Board bewertet also Einsatz gegenüber Plan statt roher Menge. TSS und Kilometer sind die unveränderten Summen für dieses Fenster; ein Strich heißt, die App hat keine Quelle für diesen Wert.',
  missingCopy: '',
}

export default function W3CrewMemberPreview() {
  const [period, setPeriod] = useState<W3Period>('week')
  const vm: W3CrewMemberVm = {
    ...BASE,
    period,
    rankLine: `1. von sechs · ${thisPeriod(period)}`,
    headlineKicker: `TSS · ${thisPeriod(period).toUpperCase()}`,
    headlineSub: `23 % der 2.140 TSS der Crew ${thisPeriod(period)}`,
    duel: {
      theirName: '@mara',
      headline: '120',
      headlineKicker: 'PUNKTE RÜCKSTAND',
      status: 'Punkte zählen nur, wie viel du von deinem EIGENEN Ziel holst. Der Rückstand ist also kein Watt-Problem — du schließt ihn mit deinen eigenen Einheiten.',
      daysLeft: 'Noch 3 Tage in diesem Fenster.',
      rows: [
        { key: 'points', label: 'CREW-PUNKTE', chip: 'FAIRSTER VERGLEICH', mine: '740', theirs: '860', minePct: 0.46, theirsPct: 0.54, gap: '120 Punkte zurück', youAhead: false },
        { key: 'tss', label: 'TSS', mine: '412', theirs: '486', minePct: 0.46, theirsPct: 0.54, gap: '74 zurück', youAhead: false },
        { key: 'km', label: 'DISTANZ', mine: '158 km', theirs: '121 km', minePct: 0.57, theirsPct: 0.43, gap: '37 km vor', youAhead: true },
        { key: 'active', label: 'AKTIVE TAGE', mine: '4 / 7', theirs: '4 / 7', minePct: 0.5, theirsPct: 0.5, gap: 'gleichauf', youAhead: null },
      ],
      note: 'Punkte sind der Anteil am eigenen Ziel jedes Fahrers. Stärkere Beine gewinnen hier also nicht automatisch — TSS, Distanz und aktive Tage stehen als rohe Summen daneben.',
    },
  }
  return <W3CrewMemberView vm={vm} onPeriod={setPeriod} />
}

import W3CrewView, { type W3CrewVm } from './W3CrewView'

/**
 * TEMP preview — pen-exact fixture for `w3.pen` frame `WAjw9` ("Nachtschicht
 * CC"). Route /e/w3-crew-preview (unguarded). Every number here is a design
 * fixture; the wired `W3CrewPage` fills these from real crew standings.
 */

// fixture: pen data — six riders of the "Nachtschicht CC"
const FIXTURE: W3CrewVm = {
  inCrew: true,
  crewName: 'Nachtschicht CC',
  blurb: 'Six riders, each scored against their own weekly plan — so a six-hour week and a fourteen-hour week sit on the same board.',
  rankOrdinal: '2nd',
  rankSub: 'of six this week · up one',
  propsHint: 'Three a week. Spend them on the effort, not the number.',
  periodChip: 'MON–SUN',
  members: [
    { id: 1, name: 'Mara', rank: 1, sessions: 4, pct: 143, isYou: false },
    { id: 2, name: 'You', rank: 2, sessions: 5, pct: 131, isYou: true },
    { id: 3, name: 'Timo', rank: 3, sessions: 3, pct: 104, isYou: false },
    { id: 4, name: 'Jonas', rank: 4, sessions: 4, pct: 96, isYou: false },
    { id: 5, name: 'Lena', rank: 5, sessions: 3, pct: 88, isYou: false },
    { id: 6, name: 'Ilker', rank: 6, sessions: 2, pct: 61, isYou: false },
  ],
  showedUp: [
    { id: 1, name: 'Mara', isYou: false, days: [true, false, false, true, false, true, false] },
    { id: 2, name: 'You', isYou: true, days: [true, true, false, true, false, true, true] },
    { id: 3, name: 'Timo', isYou: false, days: [false, true, false, false, true, false, true] },
    { id: 4, name: 'Jonas', isYou: false, days: [true, false, false, true, false, true, false] },
    { id: 5, name: 'Lena', isYou: false, days: [false, true, false, true, false, false, true] },
    { id: 6, name: 'Ilker', isYou: false, days: [false, false, true, false, false, true, false] },
  ],
  showedUpFilled: 21,
  showedUpTotal: 25,
  showedUpNote: 'A filled block is a session actually done. Five weeks running, this crew has never dropped below 18.',
  distanceKm: 412,
  distanceGoalKm: 500,
  distancePct: 82,
  distanceToGo: 88,
  yourDistanceKm: 84,
  yourDistanceNote: "You've put in 84 km — more than four of the six",
  yourSharePct: 20,
  highlights: [
    { id: 'h1', name: 'You', isYou: true, text: 'Held 271 W for eight minutes on the cobbles', badge: 'BEST SINCE MAY', fixture: true },
    { id: 'h2', name: 'Mara', isYou: false, text: 'Cleared 1,000 km for the season', badge: '1,000 KM', fixture: true },
    { id: 'h3', name: 'Ilker', isYou: false, text: 'Back on the bike after two weeks off', badge: '2 SESSIONS', fixture: true },
  ],
  seatsOpen: 2,
  seatsCopy: 'Crews of six to eight hold each other best. Fewer, and a quiet week goes unnoticed.',
}

export default function W3CrewPreview() {
  return <W3CrewView vm={FIXTURE} />
}

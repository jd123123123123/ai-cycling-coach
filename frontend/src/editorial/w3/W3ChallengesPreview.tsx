import W3ChallengesView, { type W3ChallengesVm } from './W3ChallengesView'

/** TEMP preview — pen-exact fixture for `w3.pen` frame `VsLYE`, no backend.
 *  /e/w3-challenges-preview is unguarded; remove before merge. Every value is
 *  transcribed from the pen; the reward economy it depicts is not built. */

// Month names always come from the locale, never a hand-written table.
const thisMonth = new Date().toLocaleDateString('de-DE', { month: 'long' })

export const CHALLENGES_FIXTURE: W3ChallengesVm = {
  title: 'Challenges',
  subtitle: 'Trainingsziele mit Auszahlung. Jede schaffst du, indem du den Plan fährst, nie durch Bezahlen.',
  monthlyKicker: 'Monats-Challenge',
  monthlyStatus: 'Dabei',
  monthly: {
    name: 'Heißer Streak',
    daysLeftLabel: 'Noch 19 Tage',
    blurb: `Triff an 20 Tagen im ${thisMonth} deine vorgegebene Einheit. Erholungstage zählen, wenn du sie nimmst.`,
    done: 9,
    total: 20,
    progressLabel: '9 von 20 Tagen',
    reward: 'BELOHNUNG · 1.000 RIDECOIN',
  },
  communityKicker: 'Community-Challenges',
  community: [
    {
      key: 'atw',
      title: 'Um die Welt ×2',
      cover: 'radial-gradient(120% 80% at 62% 22%, rgba(210,124,58,0.55), rgba(210,124,58,0) 60%), linear-gradient(158deg, #3a3550 0%, #241f30 42%, #12131a 100%)',
      pct: 26,
      progressNote: '20.840 von 80.150 km · noch 4 Wochen',
      youNote: 'Du hast 412 km beigetragen. Top 8 % der Community.',
    },
    {
      key: 'everest',
      title: 'Everest-Kollektiv',
      cover: 'radial-gradient(100% 65% at 42% 18%, rgba(74,138,138,0.5), rgba(74,138,138,0) 60%), linear-gradient(160deg, #1e3a3a 0%, #16302f 46%, #0d1a1c 100%)',
      pct: 47,
      progressNote: '4.180 von 8.848 km geklettert · noch 6 Wochen',
      youNote: 'Davon sind 21 km von dir. Top 14 % der Community.',
    },
  ],
  openKicker: 'Offen zum Mitmachen',
  open: [
    { key: 'threshold', title: 'Schwellen-Monat', blurb: 'Sechs 2×20-Einheiten bei 100 % FTP', reward: '800', icon: 'zap', accent: true },
    { key: 'dawn', title: 'Frühaufsteher', blurb: 'Zehn Fahrten vor 07:00 gestartet', reward: '350', icon: 'sunrise' },
    { key: 'longhaul', title: 'Lange Distanz', blurb: 'Eine Fahrt über 160 km, Tempo egal', reward: '300', icon: 'mountain' },
    { key: 'z2', title: 'Nie Z2 auslassen', blurb: 'Zwölf Stunden in Zone 2 in diesem Block', reward: '450', icon: 'repeat' },
  ],
  footnote: 'Auszahlungen landen einen Tag nach der bestätigten Fahrt in der Garage. Nichts hier lässt sich kaufen.',
}

export default function W3ChallengesPreview() {
  return <W3ChallengesView vm={CHALLENGES_FIXTURE} />
}

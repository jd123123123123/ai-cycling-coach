import W3WinsView, { type W3WinsVm } from './W3WinsView'

/** TEMP preview — pen-exact fixture, no backend. /e/w3-wins-preview is
 *  unguarded; remove before merge. Shows the full "Wins" reward concept —
 *  challenges, community pools and badges — that the live page marks as the
 *  unbuilt reward layer while keeping Personal records real. */

// Month names always come from the locale, never a hand-written table.
const monthBack = (n: number): string => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toLocaleDateString('de-DE', { month: 'long' })
}

const FIXTURE: W3WinsVm = {
  title: 'Erfolge',
  subtitle: 'Jedes Abzeichen hier ist ein Trainingsergebnis. Nichts davon ist gekauft.',
  balance: '315',

  challengesHeader: 'Deine Challenges',
  challengesSub: 'Ziele, die du dir selbst setzt · jederzeit änderbar',
  challengesChip: '4 AKTIV',
  hero: {
    title: 'Heißer Streak',
    daysLeft: 'NOCH 19 TAGE',
    body: `Triff an 20 Tagen im ${monthBack(0)} deine vorgegebene Einheit. Erholungstage zählen, wenn du sie nimmst.`,
    lit: 9,
    total: 20,
    progressLabel: '9 von 20 Tagen',
    reward: 'BELOHNUNG · 1.000 RIDECOIN',
  },

  personalHeader: 'Persönliche Challenges',
  personalSub: 'Ziele, die du dir selbst setzt · jederzeit änderbar',
  challenges: [
    { key: 'climb', title: '10 000 Hm sammeln', reward: '+500 RIDECOIN', sub: '6 240 von 10 000 m · noch 19 Tage', fill: 0.624 },
    { key: 'dawn', title: 'Frühaufsteher ×8', reward: '+350 RIDECOIN', sub: '3 von 8 Fahrten vor 07:00 · noch 19 Tage', fill: 0.375 },
    { key: 'zone', title: 'In der Zone bleiben', reward: '+300 RIDECOIN', sub: '14 von 20 Einheiten im Bereich', fill: 0.7 },
  ],
  newChallengeLabel: 'NEUE CHALLENGE',

  recordsHeader: 'Persönliche Rekorde',
  recordsSub: 'Der Balken zeigt, wie weit über deinem alten Bestwert du liegst',
  records: [
    { key: '5s', label: '5 SEK', value: '1.240 W', note: `+40 ggü. ${monthBack(3)}`, past: 0.16, best: false },
    { key: '1m', label: '1 MIN', value: '620 W', note: `+8 ggü. ${monthBack(2)}`, past: 0.08, best: false },
    { key: '12m', label: '12 MIN', value: '288 W', note: `BESTWERT · 12. ${monthBack(3).toUpperCase()}`, past: 1, best: true },
    { key: '20m', label: '20 MIN', value: '276 W', note: `+3 ggü. ${monthBack(1)}`, past: 0.05, best: false },
  ],

  communityHeader: 'Community-Challenges',
  communitySub: 'Alle Kilometer in einem Topf · dein Anteil zählt',
  communityChip: '4 DABEI',
  communityHero: {
    title: 'Um die Welt ×2',
    pct: '26 %',
    sub: '20.840 von 80.150 km · noch 4 Wochen',
    foot: 'Du hast 412 km beigetragen. Top 8 % der Community.',
    fill: 0.26,
  },
  community: [
    { key: 'everest', title: 'Alpen-Everesting', pct: '41 %', sub: '1,24 Mio. von 3,00 Mio. m · noch 6 Tage', you: 'DU 1 240 M · TOP 12 %', fill: 0.41 },
    { key: 'aug1000', title: `${monthBack(0)} 1 000`, pct: '61 %', sub: '2,39 Mio. von 3,90 Mio. km · noch 19 Tage', you: 'DU 612 KM · TOP 22 %', fill: 0.61 },
    { key: 'elbe', title: 'Elbe-Runde Staffel', pct: '78 %', sub: '312 von 400 Runden · noch 3 Tage', you: 'DU 9 RUNDEN · TOP 31 %', fill: 0.78 },
  ],

  badgesHeader: 'Abzeichen',
  badgesCount: '12 von 34',
  badges: [
    { key: 'century', icon: 'medal', name: 'Erster Century', caption: '200 KM', earned: true },
    { key: '10k', icon: 'mountain', name: '10 000 Hm', caption: 'GESAMMELT', earned: true },
    { key: 'dawn', icon: 'sunrise', name: 'Frühaufsteher', caption: '×14 FAHRTEN', earned: true },
    { key: 'ftp', icon: 'lock', name: '300 W FTP', caption: 'NOCH 8 W', earned: false },
    { key: 'streak', icon: 'lock', name: '30-Tage-Streak', caption: '17 VON 30', earned: false },
    { key: 'everest', icon: 'lock', name: 'Everest', caption: 'NOCH 3.140 M', earned: false },
  ],
}

export default function W3WinsPreview() {
  return <W3WinsView vm={FIXTURE} />
}

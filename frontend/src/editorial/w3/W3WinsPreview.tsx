import W3WinsView, { type W3WinsVm } from './W3WinsView'

/** TEMP preview — pen-exact fixture, no backend. /e/w3-wins-preview is
 *  unguarded; remove before merge. Shows the full "Wins" reward concept —
 *  challenges, community pools and badges — that the live page marks as the
 *  unbuilt reward layer while keeping Personal records real. */

const FIXTURE: W3WinsVm = {
  title: 'Wins',
  subtitle: 'Every badge here is a training outcome. Nothing is bought.',

  challengesHeader: 'Your challenges',
  challengesSub: 'Targets you set yourself · edit or drop any time',
  challengesChip: '4 ACTIVE',
  hero: {
    title: 'Hot Streak',
    daysLeft: '19 DAYS LEFT',
    body: 'Hit your prescribed session on 20 days in August. Recovery days count when you take them.',
    lit: 9,
    total: 20,
    progressLabel: '9 of 20 days',
    reward: 'REWARD · 1,000 RIDECOIN',
  },

  personalHeader: 'Personal challenges',
  personalSub: 'Targets you set yourself · edit or drop any time',
  challenges: [
    { key: 'climb', title: 'Climb 10 000 m', reward: '+500 RIDECOIN', sub: '6 240 of 10 000 m · 19 days left', fill: 0.624 },
    { key: 'dawn', title: 'Dawn patrol ×8', reward: '+350 RIDECOIN', sub: '3 of 8 rides before 07:00 · 19 days left', fill: 0.375 },
    { key: 'zone', title: 'Hold the zone', reward: '+300 RIDECOIN', sub: '14 of 20 sessions in the band', fill: 0.7 },
  ],
  newChallengeLabel: 'NEW CHALLENGE',

  recordsHeader: 'Personal records',
  recordsSub: 'Bar shows how far past your old best you went',
  records: [
    { key: '5s', label: '5 SEC', value: '1,240 W', note: '+40 on May', past: 0.16, best: false },
    { key: '1m', label: '1 MIN', value: '620 W', note: '+8 on June', past: 0.08, best: false },
    { key: '12m', label: '12 MIN', value: '288 W', note: 'YOUR BEST · 12 MAY', past: 1, best: true },
    { key: '20m', label: '20 MIN', value: '276 W', note: '+3 on July', past: 0.05, best: false },
  ],

  communityHeader: 'Community challenges',
  communitySub: "Everyone's kilometres in one pot · your share counts",
  communityChip: '4 JOINED',
  communityHero: {
    title: 'Around the world ×2',
    pct: '26%',
    sub: '20,840 of 80,150 km · 4 weeks left',
    foot: 'You have put in 412 km. Top 8% of the community.',
    fill: 0.26,
  },
  community: [
    { key: 'everest', title: 'Everest the Alps', pct: '41%', sub: '1.24M of 3.00M m · 6 days left', you: 'YOU 1 240 M · TOP 12%', fill: 0.41 },
    { key: 'aug1000', title: 'August 1 000', pct: '61%', sub: '2.39M of 3.90M km · 19 days left', you: 'YOU 612 KM · TOP 22%', fill: 0.61 },
    { key: 'elbe', title: 'Elbe Loop relay', pct: '78%', sub: '312 of 400 laps · 3 days left', you: 'YOU 9 LAPS · TOP 31%', fill: 0.78 },
  ],

  badgesHeader: 'Badges',
  badgesCount: '12 of 34',
  badges: [
    { key: 'century', icon: 'medal', name: 'First century', caption: '200 KM', earned: true },
    { key: '10k', icon: 'mountain', name: '10k metres', caption: 'CLIMBED', earned: true },
    { key: 'dawn', icon: 'sunrise', name: 'Dawn patrol', caption: '×14 RIDES', earned: true },
    { key: 'ftp', icon: 'lock', name: '300 W FTP', caption: '8 W SHORT', earned: false },
    { key: 'streak', icon: 'lock', name: '30-day streak', caption: '17 OF 30', earned: false },
    { key: 'everest', icon: 'lock', name: 'Everest', caption: '3,140 M LEFT', earned: false },
  ],
}

export default function W3WinsPreview() {
  return <W3WinsView vm={FIXTURE} />
}

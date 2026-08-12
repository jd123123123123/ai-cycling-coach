import W3ChallengesView, { type W3ChallengesVm } from './W3ChallengesView'

/** TEMP preview — pen-exact fixture for `w3.pen` frame `VsLYE`, no backend.
 *  /e/w3-challenges-preview is unguarded; remove before merge. Every value is
 *  transcribed from the pen; the reward economy it depicts is not built. */

export const CHALLENGES_FIXTURE: W3ChallengesVm = {
  title: 'Challenges',
  subtitle: 'Training targets with a payout. Every one is completed by riding the plan, never by paying.',
  monthlyKicker: 'Monthly challenge',
  monthlyStatus: 'Joined',
  monthly: {
    name: 'Hot Streak',
    daysLeftLabel: '19 days left',
    blurb: 'Hit your prescribed session on 20 days in August. Recovery days count when you take them.',
    done: 9,
    total: 20,
    progressLabel: '9 of 20 days',
    reward: 'REWARD · 1,000 RIDECOIN',
  },
  communityKicker: 'Community challenges',
  community: [
    {
      key: 'atw',
      title: 'Around the world ×2',
      cover: 'radial-gradient(120% 80% at 62% 22%, rgba(210,124,58,0.55), rgba(210,124,58,0) 60%), linear-gradient(158deg, #3a3550 0%, #241f30 42%, #12131a 100%)',
      pct: 26,
      progressNote: '20,840 of 80,150 km · 4 weeks left',
      youNote: 'You have put in 412 km. Top 8% of the community.',
    },
    {
      key: 'everest',
      title: 'Everest collective',
      cover: 'radial-gradient(100% 65% at 42% 18%, rgba(74,138,138,0.5), rgba(74,138,138,0) 60%), linear-gradient(160deg, #1e3a3a 0%, #16302f 46%, #0d1a1c 100%)',
      pct: 47,
      progressNote: '4,180 of 8,848 km climbed · 6 weeks left',
      youNote: 'You have climbed 21 km of it. Top 14% of the community.',
    },
  ],
  openKicker: 'Open to join',
  open: [
    { key: 'threshold', title: 'Threshold month', blurb: 'Six 2×20 sessions at 100% FTP', reward: '800', icon: 'zap', accent: true },
    { key: 'dawn', title: 'Dawn patrol', blurb: 'Ten rides started before 07:00', reward: '350', icon: 'sunrise' },
    { key: 'longhaul', title: 'Long haul', blurb: 'One 160 km ride, any pace', reward: '300', icon: 'mountain' },
    { key: 'z2', title: 'Never skip Z2', blurb: 'Twelve hours in zone 2 this block', reward: '450', icon: 'repeat' },
  ],
  footnote: 'Payouts land in the Garage the day after a ride is confirmed. Nothing here can be bought.',
}

export default function W3ChallengesPreview() {
  return <W3ChallengesView vm={CHALLENGES_FIXTURE} />
}

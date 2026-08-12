import W3ReferralsView, { type W3ReferralsVm } from './W3ReferralsView'

/** TEMP preview — /e/w3-referrals-preview (unguarded). Pen w9U9bF fixture. */
const FIXTURE: W3ReferralsVm = {
  code: 'HYXBS9',
  blurb: 'Recruit new riders and earn a 10% bonus on every ride they claim for 30 days when signing up.',
  activeCount: 4,
  active: [
    { id: 1, referredId: 1, handle: '@Jonathan.Ghost', avatarUrl: null, timeLeftLabel: '25d 03h', accruedLabel: '+9,786', claimable: false },
    { id: 2, referredId: 2, handle: '@WillyWonka', avatarUrl: null, timeLeftLabel: '25d 03h', accruedLabel: '+9,786', claimable: false },
    { id: 3, referredId: 3, handle: '@Lance', avatarUrl: null, timeLeftLabel: '16d 12h', accruedLabel: '+26.6k', claimable: false },
    { id: 4, referredId: 4, handle: '@LongNameRider01', avatarUrl: null, timeLeftLabel: '01d 11h', accruedLabel: '+12.6k', claimable: false },
  ],
  completedCount: 2,
  completed: [
    { id: 5, referredId: 5, handle: '@Claimable', avatarUrl: null, timeLeftLabel: 'Ended', accruedLabel: '11.5K', claimable: true },
    { id: 6, referredId: 6, handle: '@GerardDarmon', avatarUrl: null, timeLeftLabel: 'Ended', accruedLabel: '26.6K', claimable: false },
  ],
  howItWorks: 'The total amount of your bonus will be available for you to claim at the end of the 30-day period.',
}

export default function W3ReferralsPreview() {
  return <W3ReferralsView vm={FIXTURE} />
}

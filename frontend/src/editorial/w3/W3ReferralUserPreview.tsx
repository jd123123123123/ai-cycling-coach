import { useState } from 'react'
import W3ReferralUserView, { type W3ReferralUserVm } from './W3ReferralUserView'

/** TEMP preview — /e/w3-referral-user-preview (unguarded). Toggles the two pen
 *  states (Z2ryuL pending → KQmzp ended) so the design flow is inspectable. */
const BASE: W3ReferralUserVm = {
  handle: '@WillyWonka',
  avatarUrl: null,
  powerClaimed: '126k',
  totalDistance: '140.22 km',
  totalRides: '16',
  rewardLabel: '12.6k',
  ended: false,
  claimed: false,
  timeLeftLabel: '16d 12h 33m',
}

export default function W3ReferralUserPreview() {
  const [ended, setEnded] = useState(false)
  return (
    <div onClick={() => setEnded((e) => !e)} title="tap to toggle pending/ended">
      <W3ReferralUserView vm={{ ...BASE, ended }} />
    </div>
  )
}

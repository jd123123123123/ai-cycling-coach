import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useReferralUser, useClaimReferral } from '../../hooks/useReferrals'
import type { ReferralCard } from '../../api/referral'
import W3ReferralUserView, { type W3ReferralUserVm } from './W3ReferralUserView'
import W3Loading from './W3Loading'

/**
 * W3 · Referral user detail, wired. Route /e/w3-referral-user/:id. Real referred
 * rider stats + accrued 10% cut from /referrals/user/:id. When the window has
 * ended and is unclaimed, the lime button claims the accrued bonus.
 */

const compact = (n: number) => n >= 1000 ? `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}k` : String(Math.round(n))

function toVm(c: ReferralCard): W3ReferralUserVm {
  const t = c.time_left
  return {
    handle: `@${c.handle}`,
    avatarUrl: c.avatar_url,
    powerClaimed: compact(c.power_claimed),
    totalDistance: `${c.distance_km.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`,
    totalRides: String(c.rides),
    rewardLabel: compact(c.accrued_rc),
    ended: c.ended,
    claimed: c.claimed,
    timeLeftLabel: `${t.days}T ${t.hours}h ${t.minutes}m`,
  }
}

export default function W3ReferralUserPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const referredId = id ? Number(id) : undefined
  const { data } = useReferralUser(referredId)
  const claim = useClaimReferral()

  const vm = useMemo(() => (data ? toVm(data) : null), [data])
  if (!vm) return <W3Loading />

  return (
    <W3ReferralUserView
      vm={vm}
      onBack={() => navigate('/e/w3-referrals')}
      onClaim={() => data && claim.mutate(data.id)}
    />
  )
}

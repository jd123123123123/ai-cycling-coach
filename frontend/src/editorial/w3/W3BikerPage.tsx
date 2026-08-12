import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useWallet } from '../../hooks/useWallet'
import W3BikerView, { type W3BikerVm } from './W3BikerView'

// Title-case the shop tier slug for the gauge label ("prestige" → "Prestige").
const TIER_LABEL: Record<string, string> = {
  entry: 'Entry', mid: 'Mid', prestige: 'Prestige', rare: 'Rare',
}
const nf = new Intl.NumberFormat('en-US')

/**
 * W3 · 05 BIKER (profile), wired. Route /e/w3-biker.
 *
 * REAL: handle/name/avatar from `useAuth`; FTP / W·kg / weight from the athlete
 * profile; the RideCoin balance + next-tier progress from the wallet. The
 * season km/climbed, referrals and device sync-times remain the reward/device
 * layer where no field exists yet (honest "—" / fixtures, marked below).
 */
export default function W3BikerPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: profile } = useAthleteProfile()
  const { data: wallet } = useWallet()

  const vm = useMemo<W3BikerVm>(() => {
    const ftp = (profile as { ftp_watts?: number } | undefined)?.ftp_watts ?? null
    const weight = (profile as { weight_kg?: number } | undefined)?.weight_kg ?? null
    const wkg = ftp && weight ? (ftp / weight).toFixed(1) : '—'

    // Next-tier gauge from the REAL wallet: how far the balance is toward the
    // next cosmetic unlock. Honest placeholder until the first wallet read.
    const tier = wallet?.tier
    const balance = wallet?.balance ?? 0
    const tierFrom = 'Balance'
    const tierTo = tier?.next_tier ? TIER_LABEL[tier.next_tier] ?? 'Next' : 'Maxed'
    const tierPct = tier?.pct ?? 0
    const tierFoot = tier?.next_tier
      ? `${nf.format(balance)} of ${nf.format(tier.next_price)} RIDECOIN`
      : `${nf.format(balance)} RIDECOIN`
    const tierRate = tier?.next_tier ? `${nf.format(tier.to_go)} TO GO` : 'TOP TIER'

    return {
      avatarUrl: user?.avatar_url ?? null,
      handle: user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider'),
      tierChip: 'SILVER TIER', sinceChip: 'RIDING SINCE 2021', locationChip: 'HAMBURG, DE', // fixture: tier/since/location not modelled
      name: user?.display_name ?? 'Rider',
      stats: [
        { v: nf.format(balance), l: 'RideCoin', s: '' },  // real: wallet balance
        { v: '—', l: 'Climbed', s: '' },                  // fixture: season climbing total
        { v: ftp ? `${ftp} W` : '—', l: 'FTP', s: '' },
        { v: wkg, l: 'W/kg', s: weight ? `${weight} kg` : '' },
      ],
      tierFrom, tierTo, tierPct, tierFoot, tierRate,
      referralCode: 'HYXBS9',
      referralBody: 'Bring a training partner. You both get 250 RideCoin when they log their first three rides.',
      referralActive: '3 active · 750 RideCoin earned',
      devices: [
        { name: 'Garmin', sub: 'Connected', icon: 'watch', on: true },
        { name: 'Strava', sub: 'Not connected', icon: 'activity', on: false },
        { name: 'Wahoo', sub: 'Not connected', icon: 'zap', on: false },
        { name: 'Apple Health', sub: 'Not connected', icon: 'heart', on: false },
      ],
    }
  }, [user, profile, wallet])

  return <W3BikerView vm={vm} onReferral={() => navigate('/e/w3-referrals')} />
}

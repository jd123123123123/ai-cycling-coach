import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useWallet } from '../../hooks/useWallet'
import { useMyReferrals } from '../../hooks/useReferrals'
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
  const { data: referrals } = useMyReferrals()

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
      // Real rider-identity chips from FTP + W/kg (a real cycling category),
      // replacing the fixture tier/since/location.
      tierChip: wkg !== '—' ? `CAT ${Number(wkg) >= 4 ? 1 : Number(wkg) >= 3.5 ? 2 : Number(wkg) >= 3 ? 3 : Number(wkg) >= 2.5 ? 4 : 5}` : 'UNRANKED',
      sinceChip: wkg !== '—' ? `${wkg} W/KG` : '—',
      locationChip: ftp ? `${ftp} W FTP` : '—',
      name: user?.display_name ?? 'Rider',
      stats: [
        { v: nf.format(balance), l: 'RideCoin', s: '' },  // real: wallet balance
        { v: '—', l: 'Climbed', s: '' },                  // fixture: season climbing total
        { v: ftp ? `${ftp} W` : '—', l: 'FTP', s: '' },
        { v: wkg, l: 'W/kg', s: weight ? `${weight} kg` : '' },
      ],
      tierFrom, tierTo, tierPct, tierFoot, tierRate,
      referralCode: referrals?.code ?? '—',   // real referral code
      referralBody: 'Bring a training partner. You earn a 10% bonus on every ride they log for 30 days.',
      referralActive: referrals
        ? `${referrals.active_count} active · ${referrals.completed_count} completed`
        : '—',
      devices: [
        { name: 'Garmin', sub: 'Connected', icon: 'watch', on: true },
        { name: 'Strava', sub: 'Not connected', icon: 'activity', on: false },
        { name: 'Wahoo', sub: 'Not connected', icon: 'zap', on: false },
        { name: 'Apple Health', sub: 'Not connected', icon: 'heart', on: false },
      ],
    }
  }, [user, profile, wallet, referrals])

  return <W3BikerView vm={vm} onReferral={() => navigate('/e/w3-referrals')} />
}

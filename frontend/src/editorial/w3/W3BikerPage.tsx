import { useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import W3BikerView, { type W3BikerVm } from './W3BikerView'

/**
 * W3 · 05 BIKER (profile), wired. Route /e/w3-biker.
 *
 * REAL: handle/name/avatar from `useAuth`; FTP / W·kg / weight from the athlete
 * profile. The season km/climbed, tier POWER progress, referrals and device
 * sync-times are the reward/device layer — fixtures where no field exists yet.
 */
export default function W3BikerPage() {
  const { user } = useAuth()
  const { data: profile } = useAthleteProfile()

  const vm = useMemo<W3BikerVm>(() => {
    const ftp = (profile as { ftp_watts?: number } | undefined)?.ftp_watts ?? null
    const weight = (profile as { weight_kg?: number } | undefined)?.weight_kg ?? null
    const wkg = ftp && weight ? (ftp / weight).toFixed(1) : '—'
    return {
      avatarUrl: user?.avatar_url ?? null,
      handle: user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider'),
      tierChip: 'SILVER TIER', sinceChip: 'RIDING SINCE 2021', locationChip: 'HAMBURG, DE', // fixture: tier/since/location not modelled
      name: user?.display_name ?? 'Rider',
      stats: [
        { v: '—', l: 'This season', s: '' },        // fixture: season distance total
        { v: '—', l: 'Climbed', s: '' },             // fixture: season climbing total
        { v: ftp ? `${ftp} W` : '—', l: 'FTP', s: '' },
        { v: wkg, l: 'W/kg', s: weight ? `${weight} kg` : '' },
      ],
      tierFrom: 'Silver', tierTo: 'Gold', tierPct: 63, tierFoot: '15,800 of 25,000 RIDECOIN', tierRate: '~13 WEEKS AT THIS RATE',
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
  }, [user, profile])

  return <W3BikerView vm={vm} />
}

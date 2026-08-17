import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRaceDebrief } from '../../hooks/useRaceDebrief'
import { useRideEarning } from '../../hooks/useWallet'
import type { RaceDebrief } from '../../api/debrief'
import type { RideEarning } from '../../api/rewards'
import W3RideCelebrateView, {
  type W3CelebrateVm, type W3CelebStat, type W3CelebZone, type W3CelebFirst,
} from './W3RideCelebrateView'
import W3Loading from './W3Loading'

/**
 * W3 · Post-ride celebration, wired. Route /e/w3-ride-celebrate/:id.
 *
 * REAL: ride stats, power zones, and PR efforts from `useRaceDebrief`
 * (`/analytics/activity-debrief/:id`); the RideCoin breakdown (base + streak)
 * from `useRideEarning` (`/rewards/ride/:id`, straight off the ledger). The
 * "coins" are the ride's TSS — one coin per stress point, the same anchor the
 * economy earns on. Opens on a synced ride to celebrate what it just earned.
 */

const fmtHms = (s: number) => `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
const ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2', 'Anaerobic']

function toVm(d: RaceDebrief, earn: RideEarning | undefined): W3CelebrateVm {
  const h = d.header
  const tss = Math.round(h.tss)
  const total = earn?.total ?? 0

  const stats: W3CelebStat[] = [
    { icon: 'route', label: 'DISTANZ', value: h.distance_km != null ? String(Math.round(h.distance_km)) : '—', unit: 'km' },
    { icon: 'timer', label: 'FAHRZEIT', value: fmtHms(h.moving_time_s), unit: '' },
    { icon: 'power', label: 'Ø WATT', value: h.np_watts != null ? String(Math.round(h.np_watts)) : '—', unit: 'W' },
    { icon: 'climb', label: 'ANSTIEG', value: h.elevation_m != null ? String(Math.round(h.elevation_m)) : '—', unit: 'm' },
  ]

  const pct = d.pacing?.zone_time_pct ?? {}
  const zoneKeys = Object.keys(pct).slice(0, 6)
  const zones: W3CelebZone[] = zoneKeys.map((k, i) => {
    const raw = pct[k] ?? 0
    const p = Math.round(raw > 1 ? raw : raw * 100)
    const min = Math.round(((raw > 1 ? raw / 100 : raw) * h.moving_time_s) / 60)
    return { z: `ZONE ${i + 1}`, name: ZONE_NAMES[i] ?? k, min: `${min} min`, pct: p, peak: i === 3 }
  })

  const prs = d.efforts.filter((e) => e.is_pr)
  const bestEffort = d.efforts.reduce((m, e) => (e.pct_of_best ?? 0) > (m?.pct_of_best ?? 0) ? e : m, d.efforts[0])
  const firsts: W3CelebFirst[] = prs.slice(0, 3).map((e) => ({
    icon: 'flame',
    title: e.duration_s < 60 ? `${e.duration_s}s · ${e.ride_watts} W` : `${Math.round(e.duration_s / 60)} min · ${e.ride_watts} W`,
    sub: 'BESTWERT',
  }))

  // Real earning breakdown from the ledger: base (ride) + streak bonus.
  const breakdown = []
  if (earn && earn.base > 0) breakdown.push({ label: 'FAHRT', value: String(earn.base) })
  if (earn && earn.streak_bonus > 0) {
    const mult = earn.multiplier && earn.multiplier > 1 ? ` ×${earn.multiplier.toFixed(2).replace(/0$/, '')}` : ''
    breakdown.push({ label: `STREAK${mult}`, value: `+${earn.streak_bonus}` })
  }

  return {
    provider: null,   // sync provider isn't on the debrief header
    kicker: 'PUNKTE VERDIENT',
    title: 'Fahrt', titleAccent: 'gebucht.',
    settledTitle: 'Punkte', settledAccent: 'verdient.',
    total,
    coinsPending: `${tss} Coins auf der Straße`,
    coinsSettled: `${tss} Coins · alle gebucht`,
    stats, zones,
    ftp: d.wko?.mftp_watts != null ? `FTP ${Math.round(d.wko.mftp_watts)} W` : '',
    bestEffortW: bestEffort?.ride_watts != null ? `${bestEffort.ride_watts} W` : null,
    bestEffortNote: bestEffort
      ? `${bestEffort.duration_s < 60 ? `${bestEffort.duration_s} Sek` : `${Math.round(bestEffort.duration_s / 60)} min`} lang${bestEffort.is_pr ? ' · BESTWERT' : ''}`
      : '',
    firstsCount: prs.length,
    firsts,
    breakMeta: `${fmtHms(h.moving_time_s)} · ${h.distance_km != null ? Math.round(h.distance_km) : '—'} KM · ${h.np_watts != null ? Math.round(h.np_watts) : '—'} W`,
    breakdown,
    bankedNote: 'AUFS KONTO GEBUCHT',
    alreadyClaimed: false,
  }
}

export default function W3RideCelebratePage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const activityId = id ? Number(id) : undefined
  const { data: debrief } = useRaceDebrief(activityId)
  const { data: earn } = useRideEarning(activityId)

  const vm = useMemo(() => (debrief ? toVm(debrief, earn) : null), [debrief, earn])
  if (!vm) return <W3Loading label="Zähle deine Punkte…" />
  return (
    <W3RideCelebrateView
      vm={vm}
      onClose={() => navigate('/e/w3-today')}
      onShare={() => id && navigate(`/e/w3-share/${id}`)}
      onFullDetail={() => navigate(`/e/w3-ride/${id}`)}
    />
  )
}

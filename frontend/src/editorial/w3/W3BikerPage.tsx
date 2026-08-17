import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useWallet } from '../../hooks/useWallet'
import { useMyReferrals } from '../../hooks/useReferrals'
import { useStreak } from '../../hooks/useStreak'
import { useAchievements } from '../../hooks/useAchievements'
import { usePMC } from '../../hooks/usePMC'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useWahooStatus } from '../../hooks/useWahooStatus'
import { useCorosStatus } from '../../hooks/useCorosStatus'
import { useGarage } from '../../hooks/useGarage'
import { compactNumber, useRiderLifetime } from './w3RiderStats'
import W3BikerView, { type W3BikerVm, type W3Device, type W3Insight } from './W3BikerView'

/**
 * W3 · 05 BIKER (profile), wired. Route /e/w3-biker.
 *
 * ALL REAL, or an explicit "—":
 *  · identity ............ `useAuth` (name/handle) + `useGarage` for the rider
 *                          figurine. `users.avatar_url` is deliberately NOT the
 *                          hero: it also holds raw-photo leftovers from older
 *                          onboarding runs. No garage rider → the empty seat,
 *                          never the showcase figurine (that is someone else).
 *  · lifetime numbers .... `useRiderLifetime` (the same /activities reducer the
 *                          AVATAR UNLOCKED reveal shows — one arithmetic, two
 *                          screens), see `w3RiderStats.ts`
 *  · level / RideCoin .... `useWallet` (real balance + real shop-tier progress)
 *  · engine .............. athlete profile FTP + weight; fitness = today's CTL
 *                          from `/training-load/pmc`
 *  · rhythm .............. `/athletes/me/streak` + `/achievements/mine` counts
 *  · referral ............ `/referrals/mine`
 *  · devices ............. real Garmin / Wahoo / Coros connection + last sync
 *
 * Deliberately absent: anything the backend cannot answer. There is no
 * follower/location/"riding since you joined" data, so those facts are not on
 * the page at all rather than faked.
 */

const DASH = '—'
const nf = new Intl.NumberFormat('de-DE')
const TIER_LABEL: Record<string, string> = { entry: 'EINSTIEG', mid: 'MITTEL', prestige: 'PRESTIGE', rare: 'SELTEN' }

/** "Synced 2 h ago" from a real timestamp; never a guess when there is none. */
function syncedLabel(iso: string | null | undefined): string {
  if (!iso) return 'Verbunden'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'Verbunden'
  const min = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (min < 2) return 'Gerade synchronisiert'
  if (min < 60) return `Sync vor ${min} min`
  const h = Math.round(min / 60)
  if (h < 36) return `Sync vor ${h} h`
  return `Sync vor ${Math.round(h / 24)} Tagen`
}

export default function W3BikerPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: profile } = useAthleteProfile()
  const { data: wallet } = useWallet()
  const { data: referrals } = useMyReferrals()
  const { data: streak } = useStreak()
  const { data: achievements } = useAchievements()
  const { data: pmc } = usePMC(90)
  const { data: garmin } = useGarminStatus()
  const { data: wahoo } = useWahooStatus()
  const { data: coros } = useCorosStatus()
  const { data: garage } = useGarage()
  const life = useRiderLifetime()

  const vm = useMemo<W3BikerVm>(() => {
    const has = life.loaded && life.rides > 0
    // The level pill claims a level AND a role: one comes from the wallet, the
    // other from the rides. It waits for both rather than flashing LVL 1 ROOKIE.
    const ready = life.loaded && wallet != null

    // ── identity ──
    const ftp = profile?.ftp_watts ?? null
    const weight = profile?.weight_kg ?? null
    const wkg = ftp && weight ? ftp / weight : null
    const cat = wkg == null ? null : wkg >= 4 ? 1 : wkg >= 3.5 ? 2 : wkg >= 3 ? 3 : wkg >= 2.5 ? 4 : 5
    const chips = [
      cat != null ? `CAT ${cat}` : null,
      wkg != null ? `${wkg.toFixed(1)} W/KG` : null,
      ftp != null ? `${ftp} W FTP` : null,
      life.firstYear != null ? `SEIT ${life.firstYear}` : null,
    ].filter((c): c is string => c != null)

    // ── the headline: the distance, made human (never repeats the number,
    //    which lives one card below as TOTAL DISTANCE) ──
    const earthPct = life.earthLaps * 100
    const headline = !has ? DASH
      : life.earthLaps >= 1 ? `${life.earthLaps.toFixed(1)}× um die Erde`
        : `${earthPct < 1 ? earthPct.toFixed(1) : Math.round(earthPct)} % um die Erde`
    const headlineCaption = has
      ? 'jeder Kilometer, den du je gefahren bist'
      : 'deine erste Fahrt schreibt diese Zahlen'

    // ── the reveal's dopamine tiles, in this page's voice ──
    const insights: W3Insight[] = [
      {
        key: 'elevation',
        label: 'HÖHENMETER',
        value: life.elevM > 0 ? `${(life.elevM / 1000).toFixed(1)} km` : DASH,
        caption: life.elevM > 0 ? `≈ ${life.everest.toFixed(life.everest < 10 ? 1 : 0)}× Mount Everest` : 'noch keine Höhenmeter erfasst',
      },
      {
        key: 'longest',
        label: 'LÄNGSTE',
        value: has ? `${Math.round(life.longestKm)} km` : DASH,
        caption: has ? 'dein größter Tag im Sattel' : 'liegt noch vor dir',
      },
      {
        key: 'speed',
        label: 'Ø TEMPO',
        value: life.avgSpeedKmh > 0 ? life.avgSpeedKmh.toFixed(1) : DASH,
        caption: 'km/h über alle Fahrten',
      },
      {
        key: 'burned',
        label: 'VERBRANNT',
        value: life.kcal > 0 ? compactNumber(life.kcal) : DASH,
        caption: life.kcal > 0 ? `kcal · ≈ ${nf.format(life.pizzas)} Pizzen` : 'kcal',
      },
    ]

    // ── engine ── FTP/weight are the athlete's own numbers; fitness is CTL.
    const pe = pmc?.entries ?? []
    const ctl = pe.length ? pe[pe.length - 1].ctl : null
    const engine = [
      { label: 'FTP', value: ftp != null ? `${ftp} W` : DASH, caption: ftp != null ? 'Watt an der Schwelle' : 'noch nicht getestet' },
      { label: 'W/KG', value: wkg != null ? wkg.toFixed(1) : DASH, caption: weight != null ? `bei ${weight} kg` : 'Gewicht ergänzen' },
      { label: 'FITNESS', value: ctl != null ? String(Math.round(ctl)) : DASH, caption: 'CTL · 42-Tage-Belastung' },
    ]

    // ── rhythm ──
    const counts = achievements?.counts
    const streakDays = streak?.streak ?? null
    const rhythmStreak = {
      label: 'STREAK',
      value: streakDays != null ? String(streakDays) : DASH,
      caption: streak?.paused ? 'pausiert — Status gesetzt' : streakDays === 1 ? 'Tag in Folge' : 'Tage in Folge',
    }
    const rhythmBadges = {
      label: 'ABZEICHEN',
      value: counts ? `${counts.unlocked}/${counts.total}` : DASH,
      caption: 'Meilensteine, erfahren im Sattel',
    }

    // ── RideCoin: real balance, real next shop tier ──
    const tier = wallet?.tier
    const coin = {
      balance: wallet ? nf.format(wallet.balance) : DASH,
      foot: 'RIDECOIN · aus echten Fahrten verdient',
      pct: tier?.pct ?? 0,
      note: !tier ? ''
        : tier.next_tier ? `${nf.format(tier.to_go)} BIS STUFE ${TIER_LABEL[tier.next_tier] ?? 'NÄCHSTE'}` : 'HÖCHSTE STUFE',
    }

    // ── devices: only ones with a real backend status ──
    const devices: W3Device[] = [
      { name: 'Garmin', sub: garmin?.connected ? syncedLabel(garmin.last_sync_at) : 'Nicht verbunden', icon: 'watch', on: !!garmin?.connected },
      { name: 'Wahoo', sub: wahoo?.connected ? syncedLabel(wahoo.last_sync) : 'Nicht verbunden', icon: 'zap', on: !!wahoo?.connected },
    ]
    if (coros?.configured) {
      devices.push({ name: 'Coros', sub: coros.connected ? syncedLabel(coros.last_sync) : 'Nicht verbunden', icon: 'activity', on: !!coros.connected })
    }

    return {
      avatarUrl: garage?.rider?.image_base64 ?? null,
      name: user?.display_name ?? 'Fahrer',
      handle: user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider'),
      ready,
      role: life.role,
      level: life.level,
      levelPct: ready ? life.levelPct : 0,
      levelNote: ready ? `${nf.format(life.toNextLevel)} RC bis Level ${life.level + 1}` : '',
      chips,
      headline,
      headlineCaption,
      primary: {
        totalDistance: has ? `${nf.format(Math.round(life.distKm))} km` : DASH,
        totalRides: has ? nf.format(life.rides) : DASH,
        saddleTime: has ? `${nf.format(Math.round(life.saddleH))} h` : DASH,
      },
      insights,
      engine,
      streak: rhythmStreak,
      badges: rhythmBadges,
      coin,
      referral: referrals?.code
        ? { code: referrals.code, note: `${referrals.active_count} aktiv · ${referrals.completed_count} abgeschlossen` }
        : null,
      devices,
    }
  }, [user, profile, wallet, referrals, streak, achievements, pmc, garmin, wahoo, coros, garage, life])

  return (
    <W3BikerView
      vm={vm}
      onReferral={() => navigate('/e/w3-referrals')}
      onBadges={() => navigate('/e/w3-wins')}
      onCreateRider={() => navigate('/e/w3-avatar-onboard')}
    />
  )
}

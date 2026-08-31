import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useWallet } from '../../hooks/useWallet'
import { useMyReferrals } from '../../hooks/useReferrals'
import { useAchievements, useRiderRecords } from '../../hooks/useAchievements'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useWahooStatus } from '../../hooks/useWahooStatus'
import { useCorosStatus } from '../../hooks/useCorosStatus'
import { useGarage } from '../../hooks/useGarage'
import { useRiderLifetime } from './w3RiderStats'
import { highlightRecords } from './w3RiderRecords'
import W3BikerView, { type W3BikerVm, type W3Device } from './W3BikerView'

/**
 * W3 · 05 BIKER (profile), wired. Route /e/w3-biker.
 *
 * ALL REAL, or the card is not drawn:
 *  · the figure ......... `useGarage().rider` — the rider's OWN figurine. No
 *                         garage rider → the empty seat that offers the studio,
 *                         never someone else's showcase avatar.
 *  · lifetime pills ..... `useRiderLifetime` (the same /activities reducer the
 *                         AVATAR UNLOCKED reveal uses — one arithmetic, two
 *                         screens), see `w3RiderStats.ts`
 *  · the two rings ...... level progress from the rides, shop-tier progress
 *                         from the real wallet
 *  · the records ........ `/achievements/records` — LIFETIME bests computed
 *                         server-side. They are deliberately not derived from
 *                         `useActivitiesRange`: the client holds a 90-day
 *                         window, so a client-side "longest ride" would shrink
 *                         as the rider's best ride aged out of it.
 *  · badges ............. `/achievements/mine` counts + the real latest unlock
 *  · account tail ....... real wallet, real referral, real device status
 *
 * Deliberately absent: FTP/W/kg/CTL (the engine block) and the seven monuments.
 * They were the reason this page read as a dashboard about a rider rather than
 * a page about one — the training numbers live on the screens that act on them.
 */

const DASH = '—'
const nf = new Intl.NumberFormat('de-DE')
const TIER_LABEL: Record<string, string> = { entry: 'EINSTIEG', mid: 'MITTEL', prestige: 'PRESTIGE', rare: 'SELTEN' }

/** "Sync vor 2 h" from a real timestamp; never a guess when there is none. */
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
  const { data: wallet } = useWallet()
  const { data: referrals } = useMyReferrals()
  const { data: achievements } = useAchievements()
  const { data: records } = useRiderRecords()
  const { data: garmin } = useGarminStatus()
  const { data: wahoo } = useWahooStatus()
  const { data: coros } = useCorosStatus()
  const { data: garage } = useGarage()
  const life = useRiderLifetime()

  const vm = useMemo<W3BikerVm>(() => {
    const has = life.loaded && life.rides > 0
    // The level ring claims a level AND a role: one comes from the wallet, the
    // other from the rides. It waits for both rather than flashing LVL 1.
    const ready = life.loaded && wallet != null

    // ── the two lifetime figures over the portrait ──
    const pills = [
      { v: has ? nf.format(Math.round(life.distKm)) : DASH, l: 'KM' },
      { v: has ? nf.format(life.rides) : DASH, l: 'FAHRTEN' },
    ]

    // ── ring 1: where this rider is, in levels earned from real rides ──
    const tier = {
      label: ready ? `Level ${life.level} · ${life.role}` : 'Level —',
      pct: ready ? life.levelPct : 0,
      note: ready ? `${nf.format(life.toNextLevel)} RC bis Level ${life.level + 1}` : '',
    }

    // ── ring 2: the shop tier, straight off the wallet. Null when the wallet
    //    has not answered — a second ring at 0 % is a claim, not a placeholder.
    const shop = wallet?.tier
    const milestone = shop
      ? {
        pct: shop.pct ?? 0,
        label: 'Stufe',
        note: shop.next_tier
          ? `${nf.format(shop.to_go)} RC bis ${TIER_LABEL[shop.next_tier] ?? 'zur nächsten Stufe'}`
          : 'Höchste Stufe erreicht',
      }
      : null

    const counts = achievements?.counts
    const devices: W3Device[] = [
      { name: 'Garmin', sub: garmin?.connected ? syncedLabel(garmin.last_sync_at) : 'Nicht verbunden', icon: 'watch', on: !!garmin?.connected },
      { name: 'Wahoo', sub: wahoo?.connected ? syncedLabel(wahoo.last_sync) : 'Nicht verbunden', icon: 'zap', on: !!wahoo?.connected },
    ]
    if (coros?.configured) {
      devices.push({ name: 'Coros', sub: coros.connected ? syncedLabel(coros.last_sync) : 'Nicht verbunden', icon: 'activity', on: !!coros.connected })
    }

    return {
      rider: {
        avatarUrl: garage?.rider?.image_base64 ?? null,
        handle: user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider'),
        role: ready ? life.role : '',
        pills,
        tier,
        milestone,
        records: highlightRecords(records),
        // NULL, NOT `?? 0`. The zero fallback rendered "0 von 0 Erfolgen"
        // whenever /achievements/mine was still in flight or had failed — a
        // sentence that is never true of anybody, shown to riders who have
        // earned a dozen. With null the row withholds instead of inventing.
        badges: counts
          ? { unlocked: counts.unlocked, total: counts.total, latest: achievements?.latest?.title ?? null }
          : null,
      },
      coin: wallet ? { balance: nf.format(wallet.balance), note: 'aus echten Fahrten verdient' } : null,
      referral: referrals?.code
        ? { code: referrals.code, note: `${referrals.active_count} aktiv · ${referrals.completed_count} abgeschlossen` }
        : null,
      devices,
    }
  }, [user, wallet, referrals, achievements, records, garmin, wahoo, coros, garage, life])

  return (
    <W3BikerView
      vm={vm}
      onReferral={() => navigate('/e/w3-referrals')}
      onBadges={() => navigate('/e/w3-wins')}
      onRecord={() => navigate('/e/w3-wins')}
      onCreateRider={() => navigate('/e/w3-avatar-onboard')}
    />
  )
}

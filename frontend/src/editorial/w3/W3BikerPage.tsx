import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useWallet } from '../../hooks/useWallet'
import { useMyReferrals } from '../../hooks/useReferrals'
import { useAchievements, useRiderRecords } from '../../hooks/useAchievements'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useWahooStatus } from '../../hooks/useWahooStatus'
import { useCorosStatus } from '../../hooks/useCorosStatus'
import { useGarage } from '../../hooks/useGarage'
import { useActivityRhythm } from '../../hooks/useActivityRhythm'
import { useFtpHistory } from '../../hooks/useFtpHistory'
import { useFormProgress } from '../../hooks/useFormProgress'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { updateGoals } from '../../api/athletes'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import { fetchPMC } from '../../api/dashboard'
import { useRiderLifetime } from './w3RiderStats'
import { highlightRecords } from './w3RiderRecords'
import W3BikerFocus from './W3BikerFocus'
import W3BikerView, { type W3BikerVm, type W3Device } from './W3BikerView'

/** The authenticated W3 profile. Existing endpoints provide identity, activity,
 * records, wallet and devices; the view never manufactures missing data.
 * Secondary controls preserve their established routes and server writes. */

const DASH = '—'
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
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
  const { data: records, isPending: recordsPending, isError: recordsError } = useRiderRecords()
  const { data: garmin, isPending: garminPending, isError: garminError } = useGarminStatus()
  const { data: wahoo, isPending: wahooPending, isError: wahooError } = useWahooStatus()
  const { data: coros, isPending: corosPending, isError: corosError } = useCorosStatus()
  const { data: garage, isPending: garagePending, isError: garageError } = useGarage()
  // ── pen `pMYpt`'s three new blocks, each from a source that already exists ──
  const { data: rhythm, isPending: rhythmPending, isError: rhythmError } = useActivityRhythm()
  const { data: ftp } = useFtpHistory()
  const { data: form } = useFormProgress()
  // 12 weeks, which is what the frame's axis spans.
  const { data: pmc } = useQuery({
    queryKey: ['pmc', 84, 'simple'],
    queryFn: () => fetchPMC(84, 'simple'),
    staleTime: 30 * 60 * 1000,
  })
  const life = useRiderLifetime()
  const { data: profile } = useAthleteProfile()
  const qc = useQueryClient()
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  const vm = useMemo<W3BikerVm>(() => {
    const has = life.loaded && life.rides > 0
    // The level ring claims a level AND a role: one comes from the wallet, the
    // other from the rides. It waits for both rather than flashing LVL 1.
    const ready = life.loaded && wallet != null

    // ── the two lifetime figures over the portrait ──
    // The server's all-time truth first (`/achievements/mine` is already on
    // this page): the 6-year client reducer and the Wins dock used two
    // different arithmetics over two different windows and disagreed for any
    // rider with a longer history.
    const at = achievements?.all_time
    const pills = [
      { v: at?.km != null ? nf.format(Math.round(at.km)) : has ? nf.format(Math.round(life.distKm)) : DASH, l: 'KM' },
      { v: at?.rides != null ? nf.format(at.rides) : has ? nf.format(life.rides) : DASH, l: 'FAHRTEN' },
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
      { name: 'Garmin', sub: garminError ? 'Status nicht verfügbar' : garminPending ? 'Status wird geladen …' : garmin?.connected ? syncedLabel(garmin.last_sync_at) : 'Nicht verbunden', icon: 'watch', on: !!garmin?.connected },
      { name: 'Wahoo', sub: wahooError ? 'Status nicht verfügbar' : wahooPending ? 'Status wird geladen …' : wahoo?.connected ? syncedLabel(wahoo.last_sync) : 'Nicht verbunden', icon: 'zap', on: !!wahoo?.connected },
    ]
    if (coros?.configured) {
      devices.push({ name: 'Coros', sub: corosError ? 'Status nicht verfügbar' : corosPending ? 'Status wird geladen …' : coros.connected ? syncedLabel(coros.last_sync) : 'Nicht verbunden', icon: 'activity', on: !!coros.connected })
    }

    return {
      rider: {
        avatarUrl: garage?.rider?.image_base64 ?? null,
        handle: user?.display_name?.trim() || 'Dein Profil',
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
  }, [user, wallet, referrals, achievements, records, garmin, wahoo, coros, garage, life, garminError, garminPending, wahooError, wahooPending, corosError, corosPending])

  // ── SAISON: this year, against last, from the same rollup the Fahrten dock
  //    reads. Every stat is dropped rather than dashed when its source has not
  //    answered — a profile is the page a rider SHOWS somebody, and an invented
  //    figure on it is a lie they would repeat out loud.
  const season = useMemo(() => {
    const out: { label: string; value: string; unit?: string; note: string | null }[] = []
    const s = rhythm?.season
    // The year-over-year comparison lives in the achievements payload, which
    // this page already fetches — it is the one source that carries LAST
    // year to the same day, and comparing against a full previous year would
    // tell a rider in March that they had collapsed.
    const yoy = achievements?.rhythm?.season ?? null

    if (s) {
      let note: string | null = null
      if (yoy && yoy.previous.km > 0) {
        const pct = Math.round(((yoy.current.km - yoy.previous.km) / yoy.previous.km) * 100)
        note = `${pct >= 0 ? '+' : '−'}${nf.format(Math.abs(pct))} % zum Vorjahreszeitraum`
      }
      out.push({ label: 'Kilometer', value: nf.format(Math.round(s.km)), unit: 'km', note })

      if (s.elevation_m > 0) {
        out.push({
          label: 'Höhenmeter', value: nf.format(s.elevation_m), unit: 'hm',
          note: s.rides > 0 ? `Ø ${nf.format(Math.round(s.elevation_m / s.rides))} hm / Fahrt` : null,
        })
      }
    }

    const cur = ftp?.current_ftp ?? profile?.ftp_watts
    if (cur != null) {
      const first = ftp?.history?.[0]?.ftp_watts
      out.push({
        label: 'FTP', value: nf.format(cur), unit: 'W',
        note: first != null && first !== cur
          ? `${cur > first ? '+' : '−'}${nf.format(Math.abs(cur - first))} W seit der ersten Messung`
          : null,
      })
    }

    if (s && s.rides > 0) {
      // Weeks of the season ELAPSED, not 52: in March the average must be over
      // the ten weeks ridden, or every rider looks like they barely ride.
      const now = new Date()
      const jan1 = new Date(now.getFullYear(), 0, 1)
      const weeks = Math.max(1, (now.getTime() - jan1.getTime()) / (7 * 864e5))
      out.push({
        label: 'Fahrten', value: nf.format(s.rides),
        note: `Ø ${nf1.format(s.rides / weeks)} pro Woche`,
      })
    }
    return out
  }, [rhythm, ftp, achievements, profile?.ftp_watts])

  // ── FORMKURVE: the engine's own CTL, and its own delta. The series is what
  //    the window shows; the delta is what the training engine computed, and
  //    deriving one from the other would let them disagree.
  const curve = useMemo(() => {
    const entries = pmc?.entries ?? []
    if (entries.length < 4) return null
    const series = entries.map((e) => e.ctl).filter((v) => Number.isFinite(v))
    if (series.length < 4) return null
    return {
      value: form?.ctl ?? series[series.length - 1],
      delta: form?.ctl_7d_delta ?? null,
      series,
      months: [entries[0].date, entries[entries.length - 1].date].map(d => new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })),
    }
  }, [pmc, form])

  const bike = garage?.bike?.image_base64 || garage?.bike?.name
    ? {
        name: garage?.bike?.name ?? 'Dein Rad',
        imageUrl: garage?.bike?.image_base64 ?? null,
        weightKg: null,
        km: rhythm?.season?.km ?? null,
        count: null,
      }
    : null

  return (
    <W3BikerView
      vm={vm}
      insights={<W3BikerFocus/>}
      season={season}
      seasonLabel={rhythm?.season?.label ? `Saison ${rhythm.season.label}` : `Saison ${new Date().getFullYear()}`}
      seasonBuckets={rhythm?.season?.buckets ?? []}
      seasonState={rhythmError ? 'error' : rhythmPending ? 'loading' : 'ready'}
      garageState={garageError ? 'error' : garagePending ? 'loading' : 'ready'}
      recordsState={recordsError ? 'error' : recordsPending ? 'loading' : 'ready'}
      onRetry={() => { void qc.invalidateQueries({ queryKey: ['activities', 'rhythm'] }); void qc.invalidateQueries({ queryKey: ['achievements'] }); void qc.invalidateQueries({ queryKey: ['garage'] }) }}
      onEdit={() => navigate('/profile')}
      onSettings={() => navigate('/settings')}
      onDevice={(name) => navigate(name === 'Garmin' ? '/garmin/connect' : '/settings', { state: { returnTo: '/e/w3-biker' } })}
      onPower={() => navigate('/power-profile')}
      onRides={() => navigate('/e/w3-rides')}
      curve={curve}
      bike={bike}
      onGarage={() => navigate('/e/w3-garage')}
      onCrew={() => navigate('/e/w3-crew')}
      voice={{
        value: profile?.goals?.coach_voice ?? 'sachlich',
        busy: voiceBusy,
        error: voiceError,
        onSet: (id: string) => {
          setVoiceBusy(true)
          setVoiceError(null)
          void updateGoals({ coach_voice: id })
            // The brief is cached server-side for hours, so a new voice must
            // also drop the cached one — otherwise the rider picks a register
            // and hears yesterday's sentence in the old one.
            .then(() => Promise.all([
              qc.invalidateQueries({ queryKey: ['athlete', 'me'] }),
              qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT }),
            ]))
            .catch(() => setVoiceError('Die Coach-Stimme konnte nicht gespeichert werden. Bitte erneut versuchen.'))
            .finally(() => setVoiceBusy(false))
        },
      }}
      onReferral={() => navigate('/e/w3-referrals')}
      onBadges={() => navigate('/e/w3-wins')}
      onRecord={(key) => { const id = records?.[key]?.activity_id; if (id != null) navigate(`/e/w3-ride/${id}`) }}
      onCreateRider={() => navigate('/e/w3-avatar-onboard')}
    />
  )
}

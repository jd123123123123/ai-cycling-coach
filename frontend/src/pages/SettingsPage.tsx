/**
 * SettingsPage — V3 "Profile & Settings" screen (pencil-new.pen, node iYLSd).
 *
 * 1:1 with the pen frame: NavRow → ProfileCard → BODY & ENGINE →
 * CONNECTIONS → PREFERENCES → footer links. Every value is real:
 * weight/FTP from the athlete profile, Garmin/Wahoo from their status
 * endpoints, morning briefing from the push subscription state, and the
 * "Quiet on rest days" toggle persisted on the profile
 * (quiet_on_rest_days — suppresses coach push notices on rest days).
 * Integrations that don't exist (Strava, Whoop) say "Bald verfügbar".
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  Bike,
  ChevronRight,
  CircleMinus,
  Heart,
  MonitorSmartphone,
  PieChart,
  Ruler,
  Scale,
  SlidersHorizontal,
  Timer,
  Watch,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useLocale } from '../contexts/LocaleContext'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useGarminStatus } from '../hooks/useGarminStatus'
import { useWahooStatus } from '../hooks/useWahooStatus'
import { useCorosStatus } from '../hooks/useCorosStatus'
import { updateProfile } from '../api/athletes'
import type { DetailLevel } from '../types/athlete'
import { getWahooConnectUrl, disconnectWahoo } from '../api/wahoo'
import { getCorosConnectUrl, disconnectCoros } from '../api/coros'
import { enableMorningBrief, disableMorningBrief, pushSupported } from '../lib/push'

const DISPLAY_FONT = '"Sora", "Inter", ui-sans-serif, sans-serif'

// ── Row primitives (pen: Row-* frames, padding [13,0], gap 12) ──────────────

type RowValueTone = 'good' | 'accent' | 'muted'

const TONE_COLOR: Record<RowValueTone, string> = {
  good: 'var(--color-recovery)',
  accent: 'var(--color-accent)',
  muted: 'var(--color-muted)',
}

interface SettingsRowProps {
  icon: LucideIcon
  label: string
  value: string
  tone?: RowValueTone
  onClick?: () => void
  busy?: boolean
}

function SettingsRow({ icon: Icon, label, value, tone = 'muted', onClick, busy }: SettingsRowProps) {
  const inner = (
    <>
      <Icon size={20} strokeWidth={2} style={{ color: 'var(--color-ink-2)', flexShrink: 0 }} />
      <span
        className="flex-1 text-left text-[14px] font-semibold"
        style={{ color: 'var(--color-ink)' }}
      >
        {label}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: TONE_COLOR[tone] }}>
        {value}
      </span>
      {onClick && (
        <ChevronRight size={18} strokeWidth={2} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
      )}
    </>
  )
  if (!onClick) {
    return <div className="flex items-center gap-3 py-[13px] w-full">{inner}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-3 py-[13px] w-full"
      style={{ opacity: busy ? 0.55 : 1 }}
    >
      {inner}
    </button>
  )
}

function Divider() {
  return <div className="h-px w-full" style={{ backgroundColor: 'var(--color-rule)' }} />
}

/** Pen: Sec-* — 11px/700 tracked label above a $surface card, rows divided. */
function Section({ label, children }: { label: string; children: ReactNode[] }) {
  return (
    <section className="flex flex-col gap-2 w-full">
      <span
        className="text-[11px] font-bold"
        style={{ color: '#5C6570', letterSpacing: '1.4px' }}
      >
        {label}
      </span>
      <div
        className="flex flex-col w-full px-[18px] py-1 rounded-[24px]"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        {children.flatMap((child, i) =>
          i === 0 ? [child] : [<Divider key={`div-${i}`} />, child],
        )}
      </div>
    </section>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const { language, setLanguage } = useLanguage()
  const { locale } = useLocale()
  const de = locale === 'de'

  const { data: profile } = useAthleteProfile()
  const { data: garmin } = useGarminStatus()
  const { data: wahoo } = useWahooStatus()
  const { data: coros } = useCorosStatus()

  const [wahooBusy, setWahooBusy] = useState(false)
  const [corosBusy, setCorosBusy] = useState(false)
  const [briefState, setBriefState] = useState<'on' | 'off' | 'busy' | 'unsupported'>(() =>
    pushSupported() ? (Notification.permission === 'granted' ? 'on' : 'off') : 'unsupported',
  )

  // "Quiet on rest days" — persisted on the athlete profile (default ON).
  const quiet = profile?.quiet_on_rest_days ?? true
  const quietMutation = useMutation({
    mutationFn: (next: boolean) => updateProfile({ quiet_on_rest_days: next }),
    onSuccess: (next) => {
      queryClient.setQueryData(['athlete', 'me'], next)
    },
  })

  // "Detailgrad" — the onboarding depth register, persisted server-side so it
  // follows the athlete across devices. Same three levels as onboarding
  // (Begleite mich / Zeig Zahlen / Voll Pro); legacy profiles without the
  // field fall back to the local coach-language mode.
  const detailLevel: DetailLevel =
    profile?.detail_level ?? (language === 'technical' ? 'numbers' : 'guide')
  const detailMutation = useMutation({
    mutationFn: (next: DetailLevel) => updateProfile({ detail_level: next }),
    onSuccess: (next) => {
      queryClient.setQueryData(['athlete', 'me'], next)
    },
  })

  // Cross-device sync: when the server-side depth arrives, align the local
  // coach-language mode (guide → simple prose, numbers/pro → full vocabulary).
  const serverDetail = profile?.detail_level ?? null
  useEffect(() => {
    if (!serverDetail) return
    const wanted = serverDetail === 'guide' ? 'simple' : 'technical'
    if (language !== wanted) setLanguage(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDetail])

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/dashboard?tab=today')
  }

  const name = user?.display_name || user?.email?.split('@')[0] || '—'
  const initial = name.charAt(0).toUpperCase()

  const weight = profile?.weight_kg != null ? `${profile.weight_kg} kg` : '—'
  const ftp = profile?.ftp_watts != null ? `${profile.ftp_watts} W` : '—'
  const zones = profile?.ftp_watts != null ? (de ? 'aus FTP' : 'from FTP') : '—'

  const connectedLabel = de ? 'Verbunden' : 'Connected'
  const connectLabel = de ? 'Verbinden' : 'Connect'
  const on = de ? 'An' : 'On'
  const off = de ? 'Aus' : 'Off'

  const handleWahoo = async () => {
    setWahooBusy(true)
    try {
      if (wahoo?.connected) {
        const ok = window.confirm(de ? 'Wahoo-Verbindung trennen?' : 'Disconnect Wahoo?')
        if (ok) {
          await disconnectWahoo()
          await queryClient.invalidateQueries({ queryKey: ['wahoo', 'status'] })
        }
      } else {
        window.location.href = await getWahooConnectUrl()
        return // navigating away
      }
    } catch {
      // 409 → not configured on this server; leave the honest state as-is
    } finally {
      setWahooBusy(false)
    }
  }

  const handleCoros = async () => {
    setCorosBusy(true)
    try {
      if (coros?.connected) {
        const ok = window.confirm(de ? 'COROS-Verbindung trennen?' : 'Disconnect COROS?')
        if (ok) {
          await disconnectCoros()
          await queryClient.invalidateQueries({ queryKey: ['coros', 'status'] })
        }
      } else {
        window.location.href = await getCorosConnectUrl()
        return // navigating away
      }
    } catch {
      // 409 → not configured on this server; leave the honest state as-is
    } finally {
      setCorosBusy(false)
    }
  }

  const handleBrief = async () => {
    if (briefState === 'unsupported' || briefState === 'busy') return
    const was = briefState
    setBriefState('busy')
    try {
      if (was === 'on') {
        await disableMorningBrief()
        setBriefState('off')
      } else {
        await enableMorningBrief()
        setBriefState('on')
      }
    } catch {
      setBriefState(was)
    }
  }

  // Cycle guide → numbers → pro → guide; persist to the profile and keep the
  // coach-language mode (the simple-mode flag the dashboard reads) in sync.
  const DETAIL_ORDER: DetailLevel[] = ['guide', 'numbers', 'pro']
  const DETAIL_LABEL: Record<DetailLevel, string> = {
    guide: de ? 'Begleite mich' : 'Guide me',
    numbers: de ? 'Zeig Zahlen' : 'Show numbers',
    pro: de ? 'Voll Pro' : 'Full pro',
  }
  const handleDetailLevel = () => {
    const next = DETAIL_ORDER[(DETAIL_ORDER.indexOf(detailLevel) + 1) % DETAIL_ORDER.length]
    detailMutation.mutate(next)
    setLanguage(next === 'guide' ? 'simple' : 'technical')
    void queryClient.invalidateQueries({ queryKey: ['coach'] })
  }

  const handleExport = () => {
    if (!profile) return
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'athlete-profile.json',
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: 'var(--color-paper)' }}>
      <div className="mx-auto flex flex-col" style={{ maxWidth: 430 }}>
        {/* NavRow (pen Fb0TE) */}
        <div className="flex items-center gap-2.5 px-4 py-1.5 pt-[max(6px,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={goBack}
            aria-label={de ? 'Zurück' : 'Back'}
            className="flex items-center justify-center -ml-1 p-1"
          >
            <ArrowLeft size={24} strokeWidth={2} style={{ color: 'var(--color-ink)' }} />
          </button>
          <h1
            className="text-[20px] font-bold"
            style={{ color: 'var(--color-ink)', fontFamily: DISPLAY_FONT }}
          >
            {de ? 'Profil & Einstellungen' : 'Profile & Settings'}
          </h1>
        </div>

        {/* Content (pen HW5v2) */}
        <div className="flex flex-col gap-5 px-5 pt-2 pb-8">
          {/* ProfileCard (pen bsy4b) */}
          <div
            className="flex items-center gap-3.5 w-full rounded-[24px] p-[18px]"
            style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, backgroundColor: 'var(--color-accent)', flexShrink: 0 }}
            >
              <span className="text-[24px] font-bold text-white" style={{ fontFamily: DISPLAY_FONT }}>
                {initial}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span
                className="text-[18px] font-bold truncate"
                style={{ color: 'var(--color-ink)', fontFamily: DISPLAY_FONT }}
              >
                {name}
              </span>
              <span className="text-[12px] font-medium truncate" style={{ color: 'var(--color-ink-2)' }}>
                {user?.email ?? '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="rounded-full px-3.5 py-2 text-[12px] font-bold"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-ink)' }}
            >
              {de ? 'Bearbeiten' : 'Edit'}
            </button>
          </div>

          {/* BODY & ENGINE */}
          <Section label={de ? 'KÖRPER & MOTOR' : 'BODY & ENGINE'}>
            {[
              <SettingsRow
                key="weight"
                icon={Scale}
                label={de ? 'Gewicht' : 'Weight'}
                value={weight}
                onClick={() => navigate('/profile')}
              />,
              <SettingsRow
                key="ftp"
                icon={Zap}
                label="FTP"
                value={ftp}
                tone={profile?.ftp_watts != null ? 'good' : 'muted'}
                onClick={() => navigate('/profile')}
              />,
              <SettingsRow
                key="zones"
                icon={PieChart}
                label={de ? 'Zonen' : 'Zones'}
                value={zones}
                onClick={() => navigate('/profile')}
              />,
            ]}
          </Section>

          {/* CONNECTIONS */}
          <Section label={de ? 'VERBINDUNGEN' : 'CONNECTIONS'}>
            {[
              <SettingsRow
                key="garmin"
                icon={Watch}
                label="Garmin"
                value={garmin?.connected ? connectedLabel : connectLabel}
                tone={garmin?.connected ? 'good' : 'accent'}
                onClick={() => navigate('/garmin/connect')}
              />,
              // Strava / Whoop — no integration exists yet: say so honestly
              // instead of a dead "—" (review finding 5), still no chevron.
              <SettingsRow
                key="strava"
                icon={Bike}
                label="Strava"
                value={de ? 'Bald verfügbar' : 'Coming soon'}
              />,
              <SettingsRow
                key="whoop"
                icon={Heart}
                label="Whoop"
                value={de ? 'Bald verfügbar' : 'Coming soon'}
              />,
              <SettingsRow
                key="wahoo"
                icon={MonitorSmartphone}
                label="Wahoo Head Unit"
                value={wahoo?.connected ? connectedLabel : connectLabel}
                tone={wahoo?.connected ? 'good' : 'accent'}
                onClick={() => void handleWahoo()}
                busy={wahooBusy}
              />,
              // COROS — partner API. Connectable only when the server has
              // partner credentials (status.configured); otherwise an honest
              // "Bald verfügbar" with no chevron, like Strava/Whoop.
              <SettingsRow
                key="coros"
                icon={Timer}
                label="COROS"
                value={
                  coros?.connected
                    ? connectedLabel
                    : coros?.configured
                      ? connectLabel
                      : de
                        ? 'Bald verfügbar'
                        : 'Coming soon'
                }
                tone={coros?.connected ? 'good' : coros?.configured ? 'accent' : 'muted'}
                onClick={coros?.configured ? () => void handleCoros() : undefined}
                busy={corosBusy}
              />,
            ]}
          </Section>

          {/* PREFERENCES */}
          <Section label={de ? 'EINSTELLUNGEN' : 'PREFERENCES'}>
            {[
              <SettingsRow
                key="detail"
                icon={SlidersHorizontal}
                label={de ? 'Detailgrad' : 'Detail level'}
                value={DETAIL_LABEL[detailLevel]}
                onClick={handleDetailLevel}
                busy={detailMutation.isPending}
              />,
              <SettingsRow
                key="units"
                icon={Ruler}
                label={de ? 'Einheiten' : 'Units'}
                value={de ? 'Metrisch' : 'Metric'}
                onClick={() => navigate('/profile')}
              />,
              <SettingsRow
                key="brief"
                icon={Bell}
                label={de ? 'Morgen-Briefing' : 'Morning briefing'}
                value={briefState === 'unsupported' ? '—' : briefState === 'on' ? on : off}
                tone={briefState === 'on' ? 'good' : 'muted'}
                onClick={briefState === 'unsupported' ? undefined : () => void handleBrief()}
                busy={briefState === 'busy'}
              />,
              <SettingsRow
                key="quiet"
                icon={CircleMinus}
                label={de ? 'Ruhe an Ruhetagen' : 'Quiet on rest days'}
                value={quiet ? on : off}
                tone={quiet ? 'good' : 'muted'}
                onClick={() => quietMutation.mutate(!quiet)}
                busy={quietMutation.isPending}
              />,
            ]}
          </Section>

          {/* FooterLinks (pen ltpsB) */}
          <div className="flex flex-col items-center gap-3.5 pt-1.5">
            <button
              type="button"
              onClick={handleExport}
              className="text-[13px] font-semibold"
              style={{ color: 'var(--color-ink-2)' }}
            >
              {de ? 'Meine Daten exportieren' : 'Export my data'}
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-[13px] font-semibold"
              style={{ color: 'var(--color-move)' }}
            >
              {de ? 'Abmelden' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

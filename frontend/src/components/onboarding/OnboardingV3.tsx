import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import {
  Bike,
  Watch,
  Heart,
  HeartPulse,
  BadgeCheck,
  Flag,
  TrendingUp,
  CalendarPlus,
  CheckCircle2,
  Rocket,
  Loader2,
  Check,
  Copy,
} from 'lucide-react'
import { subDays } from 'date-fns'
import { useLocale } from '../../contexts/LocaleContext'
import { useLanguage } from '../../contexts/LanguageContext'
import LocaleSwitch from '../dashboard/LocaleSwitch'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useWahooStatus } from '../../hooks/useWahooStatus'
import { getWahooConnectUrl } from '../../api/wahoo'
import { getAppleHealthSetup, type AppleHealthSetup } from '../../api/appleHealth'
import { apiClient } from '../../api/client'
import { grantConsent } from '../../api/consent'
import { CONSENT_TYPES } from '../../types/consent'
import { updateProfile, updateGoals } from '../../api/athletes'
import { buildPlan } from '../../api/plan'
import { estimateFtp, starterFtp, type StarterFitness } from '../../utils/trainingScience'
import type { DaysAvailableFlags } from '../../types/athlete'

/**
 * OnboardingV3 — the three-screen V3 flow (pencil-new.pen, nodes zJGMx /
 * Db8OQ / y4S6K), merged with the challenge-doc verdict: "Goal & Depth"
 * additionally carries the two load-bearing feasibility rows (weekly-hours
 * slider + training-day chips). Everything else defaults from the depth
 * selector and is learned from behavior, never asked.
 *
 *   1 · Connect      — Garmin / Wahoo / Apple Health rows, real connect flows
 *   2 · Your Numbers — FTP + W/kg from synced history, zone strip, baseline
 *   3 · Goal & Depth — one goal, depth selector, hours + days → build plan
 */

// ── Design tokens (pencil-new.pen) ──────────────────────────────────────────
const T = {
  bg: 'var(--color-paper)',
  surface: 'var(--color-paper-2)',
  surface2: 'var(--color-surface-2)',
  surface3: 'var(--color-surface-3)',
  border: 'var(--color-rule)',
  ink: 'var(--color-ink)',
  ink2: 'var(--color-ink-2)',
  ink3: 'var(--color-muted)',
  accent: 'var(--color-accent)',
  accentSoft: 'var(--color-accent-soft)',
  recovery: 'var(--color-recovery)',
  recoverySoft: '#16E08A26',
  strain: 'var(--color-strain)',
  amber: 'var(--color-amber)',
  amberSoft: '#FFB02026',
  display: '"Sora", "Inter", ui-sans-serif, sans-serif',
  body: '"Inter", ui-sans-serif, sans-serif',
}

// Zone strip — the pen's own six-zone palette (zone-1…zone-6), fixed heights.
const ZONE_STRIP = [
  { c: '#59C3FF', h: 10 },
  { c: '#16E08A', h: 14 },
  { c: '#FFB020', h: 18 },
  { c: '#FF5A3C', h: 24 },
  { c: '#FA1E55', h: 18 },
  { c: '#8B5CF6', h: 12 },
]

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type Weekday = (typeof WEEKDAYS)[number]
const WEEKDAY_LABELS_DE: Record<Weekday, string> = {
  mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So',
}
const WEEKDAY_LABELS_EN: Record<Weekday, string> = {
  mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su',
}

type Depth = 'guide' | 'numbers' | 'pro'
type GoalMode = 'event' | 'fitter' | 'custom'

// Depth → motivation_style default (athlete_profile.py: "Guide me →
// fun_variety bias, Full pro → race_focused"); never asked directly.
const DEPTH_TO_MOTIVATION: Record<Depth, 'fun_variety' | 'fitness_builder' | 'race_focused'> = {
  guide: 'fun_variety',
  numbers: 'fitness_builder',
  pro: 'race_focused',
}

export default function OnboardingV3() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setLanguage } = useLanguage()

  const { data: profile } = useAthleteProfile()
  const today = useMemo(() => new Date(), [])
  const ninetyAgo = useMemo(() => subDays(today, 90), [today])
  const { data: actsData } = useActivitiesRange(ninetyAgo, today)
  const { data: garmin } = useGarminStatus()
  const { data: wahoo } = useWahooStatus()

  const [screen, setScreen] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 'ftp' → the plan build failed on the FTP gate; offer a jump back to the
  // numbers screen instead of pretending the finish succeeded.
  const [errorKind, setErrorKind] = useState<'ftp' | 'generic' | null>(null)

  // Screen 2 state — FTP/weight override (estimate is the default truth)
  const rides = useMemo(
    () => (actsData?.activities ?? []).filter((a) => a.sport === 'cycling'),
    [actsData],
  )
  const est = useMemo(() => estimateFtp(actsData?.activities ?? []), [actsData])
  const [ftpInput, setFtpInput] = useState('')
  const [weightInput, setWeightInput] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  // "Ich kenn meine FTP nicht" — self-assessed fitness feel; with weight it
  // yields a conservative starter FTP so plan/build succeeds for everyone.
  const [selfLevel, setSelfLevel] = useState<StarterFitness | null>(null)

  const weight = weightInput !== ''
    ? Number(weightInput) || null
    : profile?.weight_kg ?? null
  const starterEstimate = selfLevel ? starterFtp(weight, selfLevel) : null
  const ftp = ftpInput !== ''
    ? Math.round(Number(ftpInput)) || null
    : profile?.ftp_watts ?? est?.watts ?? starterEstimate
  const wkg = ftp && weight ? ftp / weight : null
  // The FTP is a self-assessment prior (not measured, not manually entered).
  const ftpIsStarter =
    ftpInput === '' && profile?.ftp_watts == null && est == null && starterEstimate != null

  // Screen 3 state — goal, depth, hours + days (challenge-doc rows)
  const hasKnownEvent = !!(profile?.target_event_date || profile?.goals?.target_event_name)
  const [goalMode, setGoalMode] = useState<GoalMode | null>(null)
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [depth, setDepth] = useState<Depth>('numbers')
  const [hours, setHours] = useState(profile?.weekly_hours_available ?? 8)
  // Sensible starter selection (Tue/Thu/Sat/Sun) — NOT all seven days; a
  // 7-day default silently promised daily training (review finding 4c).
  const [days, setDays] = useState<Record<Weekday, boolean>>({
    mon: false, tue: true, wed: false, thu: true, fri: false, sat: true, sun: true,
  })
  const daysCount = WEEKDAYS.filter((d) => days[d]).length

  const goal: GoalMode | null = goalMode ?? (hasKnownEvent ? 'event' : null)

  async function handleFinish() {
    setSubmitting(true)
    setError(null)
    setErrorKind(null)
    try {
      // 1) Required consents (the V3 flow folds the consent notice into the
      //    footer of screen 1; granting happens once, here).
      for (const c of CONSENT_TYPES) {
        if (c.required) {
          await grantConsent({
            consent_type: c.type,
            consent_version: '1.0',
            granted: true,
            consent_text: c.description,
          })
        }
      }

      // 2) Profile — numbers + the two load-bearing feasibility inputs.
      const daysPayload: DaysAvailableFlags = { ...days }
      const profileUpdate: Parameters<typeof updateProfile>[0] = {
        primary_sport: profile?.primary_sport ?? 'cycling',
        weekly_hours_available: hours,
        days_available: daysPayload,
        motivation_style: DEPTH_TO_MOTIVATION[depth],
        // Depth follows the athlete across devices — Settings "Detailgrad"
        // reads/writes the same profile field (was localStorage-only).
        detail_level: depth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
      if (ftp) profileUpdate.ftp_watts = ftp
      if (weight) profileUpdate.weight_kg = weight
      if (selfLevel) profileUpdate.experience_level = selfLevel
      if (goal === 'fitter') {
        profileUpdate.target_event_type = 'maintenance'
      } else if (goal === 'custom' && eventDate) {
        profileUpdate.target_event_type = 'fondo'
        profileUpdate.target_event_date = eventDate
        profileUpdate.target_priority = 'A'
      }
      await updateProfile(profileUpdate)

      // 3) Goals JSON (free-form) — event name + hours.
      await updateGoals({
        weekly_hours: hours,
        days_per_week: daysCount,
        ...(goal === 'custom' && eventName ? { target_event_name: eventName } : {}),
        ...(goal === 'custom' && eventDate ? { target_event_date: eventDate } : {}),
      })

      // 4) Depth also drives the local UI registers immediately: the legacy
      //    localStorage key (same-device fast path) and the coach language
      //    mode the dashboard reads ('guide' → plain language, otherwise
      //    full vocabulary). The server-side truth is detail_level above.
      localStorage.setItem('onboarding.depth.v3', depth)
      setLanguage(depth === 'guide' ? 'simple' : 'technical')

      // 5) Build the plan. This must NOT fail silently: a 409 means the
      //    profile can't support a plan (FTP gate) — landing the athlete on
      //    an empty dashboard as if everything worked was the review's
      //    blocker finding. Show an honest error + a path to fix instead.
      try {
        await buildPlan('onboarding')
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status
        if (status === 409) {
          setErrorKind('ftp')
          setError(
            de
              ? 'Dein Profil ist gespeichert, aber wir konnten noch keinen Plan bauen — es fehlt ein gültiger FTP-Startwert. Geh zurück zu deinen Werten und setz eine Startschätzung.'
              : 'Your profile is saved, but we couldn’t build a plan yet — a valid starting FTP is missing. Go back to your numbers and set a starting estimate.',
          )
        } else if (status === 401) {
          setErrorKind('generic')
          setError(
            de ? 'Sitzung abgelaufen — bitte neu anmelden.' : 'Session expired — please sign in again.',
          )
        } else {
          setErrorKind('generic')
          setError(
            de
              ? 'Der Plan konnte nicht erstellt werden. Bitte versuch es gleich noch einmal.'
              : 'We couldn’t build your plan. Please try again in a moment.',
          )
        }
        setSubmitting(false)
        return
      }

      await qc.invalidateQueries()
      navigate('/dashboard', { replace: true })
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setErrorKind('generic')
      setError(
        status === 401
          ? de ? 'Sitzung abgelaufen — bitte neu anmelden.' : 'Session expired — please sign in again.'
          : de ? 'Speichern fehlgeschlagen. Bitte erneut versuchen.' : 'Could not save. Please try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg, color: T.ink, fontFamily: T.body }}>
      <div
        className="mx-auto w-full flex flex-col"
        style={{ maxWidth: 430, padding: '16px 20px 32px', gap: 24, minHeight: '100dvh' }}
      >
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <Dots active={screen} onJump={(i) => i < screen && setScreen(i)} />
          <LocaleSwitch />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col flex-1"
            style={{ gap: 24 }}
          >
            {screen === 0 && (
              <ConnectScreen
                de={de}
                garminConnected={!!garmin?.connected}
                wahooConnected={!!wahoo?.connected}
                qc={qc}
                onContinue={() => setScreen(1)}
              />
            )}
            {screen === 1 && (
              <NumbersScreen
                de={de}
                rideCount={rides.length}
                ftp={ftp}
                wkg={wkg}
                weight={weight}
                confidence={ftpInput !== '' ? null : profile?.ftp_watts ? 1 : est?.confidence ?? null}
                ftpIsStarter={ftpIsStarter}
                selfLevel={selfLevel}
                setSelfLevel={setSelfLevel}
                adjusting={adjusting}
                setAdjusting={setAdjusting}
                ftpInput={ftpInput}
                setFtpInput={setFtpInput}
                weightInput={weightInput}
                setWeightInput={setWeightInput}
                onContinue={() => setScreen(2)}
              />
            )}
            {screen === 2 && (
              <GoalDepthScreen
                de={de}
                profileEvent={
                  hasKnownEvent
                    ? {
                        name: profile?.goals?.target_event_name ?? (de ? 'Dein Event' : 'Your event'),
                        date: profile?.target_event_date ?? profile?.goals?.target_event_date ?? null,
                        type: profile?.target_event_type ?? null,
                      }
                    : null
                }
                goal={goal}
                setGoal={setGoalMode}
                eventName={eventName}
                setEventName={setEventName}
                eventDate={eventDate}
                setEventDate={setEventDate}
                depth={depth}
                setDepth={setDepth}
                hours={hours}
                setHours={setHours}
                days={days}
                toggleDay={(d) => {
                  setDays((prev) => {
                    const next = { ...prev, [d]: !prev[d] }
                    return WEEKDAYS.some((k) => next[k]) ? next : prev
                  })
                }}
                error={error}
                errorKind={errorKind}
                onGoToNumbers={() => setScreen(1)}
                submitting={submitting}
                onFinish={handleFinish}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function Dots({ active, onJump }: { active: number; onJump: (i: number) => void }) {
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`Schritt ${i + 1}`}
          onClick={() => onJump(i)}
          style={{
            width: i === active ? 22 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === active ? T.accent : T.surface3,
            transition: 'width 200ms, background-color 200ms',
            padding: 0,
            border: 'none',
            cursor: i < active ? 'pointer' : 'default',
          }}
        />
      ))}
    </div>
  )
}

function TitleBlock({ overline, title, sub }: { overline: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <span style={{ color: T.accent, fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>
        {overline}
      </span>
      <h1
        style={{
          fontFamily: T.display,
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1.15,
          color: T.ink,
          margin: 0,
        }}
      >
        {title}
      </h1>
      {sub && (
        <p style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.45, color: T.ink2, margin: 0 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function Cta({
  label,
  icon,
  onClick,
  disabled,
  busy,
}: {
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="w-full flex items-center justify-center"
      style={{
        gap: 7,
        padding: '15px 0',
        borderRadius: 100,
        backgroundColor: T.accent,
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: 700,
        border: 'none',
        opacity: disabled ? 0.5 : busy ? 0.75 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : icon}
      {label}
    </button>
  )
}

const fieldStyle: CSSProperties = {
  backgroundColor: T.surface2,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 14,
  color: T.ink,
  width: '100%',
  outline: 'none',
  colorScheme: 'dark',
}

// ── Screen 1 · Connect ──────────────────────────────────────────────────────

type Provider = 'garmin' | 'wahoo' | 'apple'

function ConnectScreen({
  de,
  garminConnected,
  wahooConnected,
  qc,
  onContinue,
}: {
  de: boolean
  garminConnected: boolean
  wahooConnected: boolean
  qc: ReturnType<typeof useQueryClient>
  onContinue: () => void
}) {
  const [open, setOpen] = useState<Provider | null>(null)

  const rows: Array<{
    key: Provider
    icon: ReactNode
    label: string
    sub: string
    connected: boolean
  }> = [
    {
      key: 'garmin',
      icon: <Watch size={21} strokeWidth={2} style={{ color: T.strain }} />,
      label: 'Garmin',
      sub: de ? 'Fahrten, HF & Schlaf' : 'Rides, HR & sleep',
      connected: garminConnected,
    },
    {
      key: 'wahoo',
      icon: <Bike size={21} strokeWidth={2} style={{ color: T.accent }} />,
      label: 'Wahoo',
      sub: de ? 'ELEMNT / KICKR Workouts' : 'ELEMNT / KICKR workouts',
      connected: wahooConnected,
    },
    {
      key: 'apple',
      icon: <Heart size={21} strokeWidth={2} style={{ color: T.recovery }} />,
      label: 'Apple Health',
      sub: de ? 'Erholung & HRV-Baseline' : 'Recovery & HRV baseline',
      connected: false,
    },
  ]

  return (
    <>
      <TitleBlock
        overline={de ? 'LOS GEHT’S' : 'GET STARTED'}
        title={de ? 'Dein Motor, schon vermessen' : 'Your engine, already measured'}
        sub={
          de
            ? 'Verbinde deine Fahrten und dein Wearable — wir bauen FTP, Zonen und Erholungs-Baseline aus dem, was du schon gefahren bist. Kein Test nötig.'
            : 'Connect your ride history and wearable — we build your FTP, zones and recovery baseline from what you’ve already done. No test required.'
        }
      />

      <div className="flex flex-col" style={{ gap: 12 }}>
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex flex-col"
            style={{
              backgroundColor: T.surface,
              border: `1px solid ${r.connected ? T.recovery : T.border}`,
              borderRadius: 24,
              padding: '14px 16px',
              gap: 12,
            }}
          >
            <div className="flex items-center" style={{ gap: 12 }}>
              <div
                className="flex items-center justify-center shrink-0"
                style={{ width: 42, height: 42, borderRadius: 100, backgroundColor: T.surface2 }}
              >
                {r.icon}
              </div>
              <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: T.ink2 }}>{r.sub}</span>
              </div>
              {r.connected ? (
                <span
                  className="flex items-center shrink-0"
                  style={{
                    gap: 4,
                    padding: '8px 14px',
                    borderRadius: 100,
                    backgroundColor: T.recoverySoft,
                    color: T.recovery,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <Check size={13} strokeWidth={2.6} />
                  {de ? 'Verbunden' : 'Connected'}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen((o) => (o === r.key ? null : r.key))}
                  className="shrink-0"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 100,
                    backgroundColor: open === r.key ? T.surface3 : T.surface2,
                    color: T.ink,
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {de ? 'Verbinden' : 'Connect'}
                </button>
              )}
            </div>
            {open === r.key && !r.connected && (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                {r.key === 'garmin' && <GarminInline de={de} qc={qc} />}
                {r.key === 'wahoo' && <WahooInline de={de} />}
                {r.key === 'apple' && <AppleInline de={de} />}
              </div>
            )}
          </div>
        ))}
      </div>

      <p
        className="text-center"
        style={{ fontSize: 12, fontWeight: 500, color: T.ink3, margin: 0 }}
      >
        {de
          ? 'Keine Historie? Starte frisch — wir lernen dich in zwei Wochen kennen.'
          : 'No history? Start fresh — we’ll learn you in two weeks.'}
      </p>

      <div className="flex flex-col mt-auto" style={{ gap: 10 }}>
        <Cta label={de ? 'Weiter' : 'Continue'} onClick={onContinue} />
        <p className="text-center" style={{ fontSize: 10.5, color: T.ink3, margin: 0, lineHeight: 1.4 }}>
          {de
            ? 'Mit „Weiter“ stimmst du der Verarbeitung deiner Trainings- und Gesundheitsdaten zu (Art. 9 DSGVO). Details & Widerruf in den Einstellungen.'
            : 'By continuing you consent to the processing of your training and health data (GDPR Art. 9). Details & withdrawal in Settings.'}
        </p>
      </div>
    </>
  )
}

function GarminInline({ de, qc }: { de: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function connect() {
    setBusy(true)
    setErr(null)
    try {
      await apiClient.post('/garmin/connect', { email, password })
      await qc.invalidateQueries({ queryKey: ['garmin', 'status'] })
      await qc.invalidateQueries({ queryKey: ['activities'] })
      setDone(true)
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setErr(
        status === 401
          ? de ? 'Anmeldedaten abgelehnt.' : 'Credentials rejected.'
          : de ? 'Verbindung fehlgeschlagen.' : 'Connection failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="flex items-center" style={{ gap: 6, fontSize: 12, color: T.recovery, margin: 0, fontWeight: 600 }}>
        <Check size={14} strokeWidth={2.6} />
        {de ? 'Garmin verbunden — Erstsync läuft.' : 'Garmin connected — first sync running.'}
      </p>
    )
  }
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={de ? 'Garmin E-Mail' : 'Garmin email'}
        style={fieldStyle}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={de ? 'Garmin Passwort' : 'Garmin password'}
        style={fieldStyle}
      />
      {err && <span style={{ fontSize: 11.5, color: 'var(--color-bad)' }}>{err}</span>}
      <button
        type="button"
        onClick={connect}
        disabled={busy || !email || !password}
        className="flex items-center justify-center"
        style={{
          gap: 6,
          padding: '10px 0',
          borderRadius: 100,
          backgroundColor: T.surface3,
          color: T.ink,
          fontSize: 12,
          fontWeight: 700,
          border: 'none',
          opacity: busy || !email || !password ? 0.55 : 1,
        }}
      >
        {busy && <Loader2 size={13} className="animate-spin" />}
        {busy ? (de ? 'Verbinde…' : 'Connecting…') : de ? 'Garmin verbinden' : 'Connect Garmin'}
      </button>
      <p style={{ fontSize: 10.5, color: T.ink3, margin: 0, lineHeight: 1.4 }}>
        {de
          ? 'Verschlüsselt gespeichert — der Erstsync zieht 90 Tage Historie.'
          : 'Stored encrypted — the first sync pulls 90 days of history.'}
      </p>
    </div>
  )
}

function WahooInline({ de }: { de: boolean }) {
  const [busy, setBusy] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)

  async function connect() {
    setBusy(true)
    try {
      window.location.href = await getWahooConnectUrl()
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 409) setNotConfigured(true)
      setBusy(false)
    }
  }

  if (notConfigured) {
    return (
      <p style={{ fontSize: 12, color: T.ink3, margin: 0 }}>
        {de
          ? 'Wahoo ist auf diesem Server noch nicht konfiguriert.'
          : 'Wahoo isn’t configured on this server yet.'}
      </p>
    )
  }
  return (
    <button
      type="button"
      onClick={connect}
      disabled={busy}
      className="w-full flex items-center justify-center"
      style={{
        gap: 6,
        padding: '10px 0',
        borderRadius: 100,
        backgroundColor: T.surface3,
        color: T.ink,
        fontSize: 12,
        fontWeight: 700,
        border: 'none',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy && <Loader2 size={13} className="animate-spin" />}
      {busy ? (de ? 'Öffne Wahoo…' : 'Opening Wahoo…') : de ? 'Mit Wahoo anmelden' : 'Sign in with Wahoo'}
    </button>
  )
}

function AppleInline({ de }: { de: boolean }) {
  const [setup, setSetup] = useState<AppleHealthSetup | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    setBusy(true)
    try {
      setSetup(await getAppleHealthSetup())
    } catch {
      /* surfaced through the button staying enabled */
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    } catch { /* value stays visible */ }
  }

  if (!setup) {
    return (
      <div className="flex flex-col" style={{ gap: 8 }}>
        <p style={{ fontSize: 11.5, color: T.ink3, margin: 0, lineHeight: 1.45 }}>
          {de
            ? 'Apple Health sendet über die iOS-App „Auto Health Export“ (REST-API-Ziel).'
            : 'Apple Health pushes via the “Auto Health Export” iOS app (REST API destination).'}
        </p>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="flex items-center justify-center"
          style={{
            gap: 6, padding: '10px 0', borderRadius: 100, backgroundColor: T.surface3,
            color: T.ink, fontSize: 12, fontWeight: 700, border: 'none', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {de ? 'Einrichtung anzeigen' : 'Show setup'}
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {[
        { k: 'url', label: 'Webhook-URL', v: setup.webhook_url },
        { k: 'token', label: 'Token', v: setup.token },
      ].map((row) => (
        <div key={row.k} className="flex items-center" style={{ gap: 8 }}>
          <span
            className="flex-1 min-w-0"
            style={{
              ...fieldStyle,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 11, color: T.ink2,
            }}
          >
            {row.v}
          </span>
          <button
            type="button"
            onClick={() => copy(row.v, row.k)}
            className="flex items-center shrink-0"
            style={{
              gap: 4, padding: '8px 12px', borderRadius: 100, backgroundColor: T.surface3,
              color: T.ink, fontSize: 11, fontWeight: 700, border: 'none',
            }}
          >
            {copied === row.k ? <Check size={12} strokeWidth={2.6} /> : <Copy size={12} />}
            {row.label}
          </button>
        </div>
      ))}
      <p style={{ fontSize: 10.5, color: T.ink3, margin: 0, lineHeight: 1.4 }}>
        {de
          ? 'In „Auto Health Export“ als REST-Ziel einfügen — Header „Authorization: Bearer <Token>“.'
          : 'Paste as a REST destination in “Auto Health Export” — header “Authorization: Bearer <token>”.'}
      </p>
    </div>
  )
}

// ── Screen 2 · Your Numbers ─────────────────────────────────────────────────

function NumbersScreen({
  de,
  rideCount,
  ftp,
  wkg,
  weight,
  confidence,
  ftpIsStarter,
  selfLevel,
  setSelfLevel,
  adjusting,
  setAdjusting,
  ftpInput,
  setFtpInput,
  weightInput,
  setWeightInput,
  onContinue,
}: {
  de: boolean
  rideCount: number
  ftp: number | null
  wkg: number | null
  weight: number | null
  confidence: number | null
  ftpIsStarter: boolean
  selfLevel: StarterFitness | null
  setSelfLevel: (v: StarterFitness | null) => void
  adjusting: boolean
  setAdjusting: (v: boolean) => void
  ftpInput: string
  setFtpInput: (v: string) => void
  weightInput: string
  setWeightInput: (v: string) => void
  onContinue: () => void
}) {
  // Honest no-data variant: without rides there is nothing "found", so the
  // headline, chip and CTA all switch to "set your starting numbers" mode.
  const hasData = rideCount > 0 || (confidence != null && confidence >= 1)

  // Confidence chip: manual input → "set manually"; real rides → confidence
  // tiers; self-assessment → amber "starter estimate". Never a green
  // "high confidence" without actual data behind it (review finding 2).
  const conf =
    ftpInput !== ''
      ? { label: de ? 'Manuell gesetzt' : 'Set manually', color: T.strain, bg: '#38B6FF26' }
      : ftpIsStarter
        ? { label: de ? 'Startschätzung' : 'Starter estimate', color: T.amber, bg: T.amberSoft }
        : hasData && confidence != null && confidence >= 0.8
          ? { label: de ? 'Hohe Konfidenz' : 'High confidence', color: T.recovery, bg: T.recoverySoft }
          : hasData && confidence != null && confidence > 0
            ? { label: de ? 'Erste Schätzung' : 'Early estimate', color: T.amber, bg: T.amberSoft }
            : { label: de ? 'Noch keine Daten' : 'No data yet', color: T.ink3, bg: T.surface2 }

  const needsStarter = !hasData && ftp == null

  return (
    <>
      <TitleBlock
        overline={
          rideCount > 0
            ? de ? `AUS ${rideCount} FAHRTEN` : `FROM ${rideCount} RIDES`
            : de ? 'NOCH KEINE FAHRTEN' : 'NO RIDES YET'
        }
        title={
          hasData
            ? de ? 'Wir haben deine Werte gefunden' : 'We found your numbers'
            : de ? 'Lass uns deine Startwerte setzen' : 'Let’s set your starting numbers'
        }
        sub={
          hasData
            ? undefined
            : de
              ? 'Kein Problem ohne Historie — eine ehrliche Schätzung reicht, dein erster Plan startet damit.'
              : 'No history needed — an honest estimate is enough to start your first plan.'
        }
      />

      {/* FTP Hero */}
      <div
        className="flex flex-col"
        style={{
          backgroundColor: T.surface,
          border: `1px solid ${T.accent}`,
          borderRadius: 24,
          padding: 22,
          gap: 16,
        }}
      >
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: T.ink3 }}>
            FUNCTIONAL THRESHOLD POWER
          </span>
          <span
            className="flex items-center shrink-0"
            style={{
              gap: 4,
              padding: '5px 10px',
              borderRadius: 100,
              backgroundColor: conf.bg,
              color: conf.color,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <BadgeCheck size={13} strokeWidth={2.4} />
            {conf.label}
          </span>
        </div>

        {/* Plain-language explainer — beginners don't know what "FTP" means. */}
        <p style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.ink3, margin: '-8px 0 0' }}>
          {de
            ? 'FTP = die Leistung, die du etwa eine Stunde halten kannst. Daraus entstehen deine Trainingszonen.'
            : 'FTP = the power you can hold for about an hour. Your training zones are built from it.'}
        </p>

        <div className="flex items-center" style={{ gap: 18 }}>
          <div className="flex items-end" style={{ gap: 5 }}>
            <span
              style={{
                fontFamily: T.display,
                fontSize: 54,
                fontWeight: 700,
                lineHeight: 1,
                color: T.ink,
              }}
            >
              {ftp ?? '—'}
            </span>
            <span style={{ fontSize: 16, fontWeight: 500, color: T.ink3, paddingBottom: 6 }}>W</span>
          </div>
          <div style={{ width: 1, height: 44, backgroundColor: T.border }} />
          <div className="flex flex-col" style={{ gap: 2 }}>
            <div className="flex items-end" style={{ gap: 4 }}>
              <span
                style={{
                  fontFamily: T.display,
                  fontSize: 32,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: T.accent,
                }}
              >
                {wkg ? wkg.toFixed(1) : '—'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.ink3, paddingBottom: 2 }}>
                W/kg
              </span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: T.ink3 }}>
              {weight
                ? de ? `bei ${weight.toLocaleString('de-DE')} kg` : `at ${weight} kg`
                : de ? 'Gewicht fehlt' : 'weight missing'}
            </span>
          </div>
        </div>

        <div className="flex items-end" style={{ gap: 4 }}>
          {ZONE_STRIP.map((z, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ height: z.h, borderRadius: 3, backgroundColor: z.c }}
            />
          ))}
        </div>

        <p style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: T.ink2, margin: 0 }}>
          {de
            ? 'Trainingszonen sind einfach Anstrengungsstufen (locker bis Vollgas), abgeleitet aus deiner FTP — sie passen sich automatisch an, wenn du schneller wirst. Kein Test nötig.'
            : 'Training zones are simply effort levels (easy to all-out), derived from your FTP — they update automatically as you get faster. No test needed.'}
        </p>

        {ftpIsStarter && (
          <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.amber, margin: '-6px 0 0' }}>
            {de
              ? 'Startschätzung — wir kalibrieren, sobald du fährst.'
              : 'Starter estimate — we calibrate as soon as you ride.'}
          </p>
        )}

        {adjusting && (
          <div className="flex" style={{ gap: 8 }}>
            <div className="flex flex-col flex-1" style={{ gap: 4 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: T.ink3 }}>
                FTP (W)
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={ftpInput}
                placeholder={ftp ? String(ftp) : '240'}
                onChange={(e) => setFtpInput(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div className="flex flex-col flex-1" style={{ gap: 4 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: T.ink3 }}>
                {de ? 'GEWICHT (KG)' : 'WEIGHT (KG)'}
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={weightInput}
                placeholder={weight ? String(weight) : '72'}
                onChange={(e) => setWeightInput(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>
        )}
      </div>

      {/* "Ich kenn meine FTP nicht" — self-assessment starter path. Without
          it the no-device athlete hits the backend FTP gate and lands on an
          empty dashboard (the review's blocker finding). */}
      {!hasData && ftpInput === '' && (
        <div
          className="flex flex-col"
          style={{
            backgroundColor: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 24,
            padding: '16px 16px 14px',
            gap: 12,
          }}
        >
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
              {de ? 'Ich kenn meine FTP nicht' : 'I don’t know my FTP'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: T.ink2 }}>
              {de
                ? 'Sag uns kurz, wie fit du dich fühlst — wir setzen eine vorsichtige Startschätzung.'
                : 'Tell us how fit you feel — we’ll set a careful starting estimate.'}
            </span>
          </div>

          <div className="flex flex-col" style={{ gap: 6 }}>
            {(
              [
                {
                  key: 'new' as StarterFitness,
                  title: de ? 'Neu dabei' : 'Just starting',
                  sub: de ? 'Wenig oder kein Radtraining bisher' : 'Little or no riding so far',
                },
                {
                  key: 'returning' as StarterFitness,
                  title: de ? 'Fahre ab und zu' : 'Ride now and then',
                  sub: de ? 'Regelmäßig unterwegs, ohne Struktur' : 'Regular rides, no structure',
                },
                {
                  key: 'seasoned' as StarterFitness,
                  title: de ? 'Fahre viel' : 'Ride a lot',
                  sub: de ? 'Fit, schon länger im Sattel' : 'Fit, been riding for a while',
                },
              ]
            ).map((o) => {
              const selected = selfLevel === o.key
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setSelfLevel(selected ? null : o.key)}
                  className="flex items-center w-full text-left"
                  style={{
                    gap: 10,
                    padding: '11px 13px',
                    borderRadius: 16,
                    backgroundColor: selected ? T.accentSoft : T.surface2,
                    border: `1px solid ${selected ? T.accent : T.border}`,
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex flex-col flex-1 min-w-0" style={{ gap: 1 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: selected ? T.accent : T.ink }}>
                      {o.title}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: T.ink3 }}>{o.sub}</span>
                  </div>
                  {selected && (
                    <CheckCircle2 size={18} strokeWidth={2.2} className="shrink-0" style={{ color: T.accent }} />
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex flex-col" style={{ gap: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: T.ink3 }}>
              {de ? 'GEWICHT (KG)' : 'WEIGHT (KG)'}
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={weightInput}
              placeholder={weight != null ? String(weight) : '72'}
              onChange={(e) => setWeightInput(e.target.value)}
              style={fieldStyle}
            />
          </div>

          {selfLevel && weight == null && (
            <span style={{ fontSize: 11.5, fontWeight: 500, color: T.amber }}>
              {de
                ? 'Trag noch dein Gewicht ein — daraus rechnen wir deine Startschätzung.'
                : 'Add your weight — we compute your starting estimate from it.'}
            </span>
          )}
        </div>
      )}

      {/* Recovery baseline */}
      <div
        className="flex items-center"
        style={{
          backgroundColor: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 24,
          padding: '14px 16px',
          gap: 12,
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 42, height: 42, borderRadius: 100, backgroundColor: T.recoverySoft }}
        >
          <HeartPulse size={21} strokeWidth={2} style={{ color: T.recovery }} />
        </div>
        <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
            {de ? 'Erholungs-Baseline: lernt noch' : 'Recovery baseline: learning'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: T.ink2 }}>
            {de
              ? 'HRV & Schlaf kalibrieren sich über deine ersten 14 Nächte — die Werte werden schnell persönlich.'
              : 'HRV & sleep calibrate over your first 14 nights — scores get personal fast.'}
          </span>
        </div>
      </div>

      <div className="flex flex-col mt-auto" style={{ gap: 0 }}>
        {needsStarter && (
          <p
            className="text-center"
            style={{ fontSize: 11.5, fontWeight: 500, color: T.ink3, margin: '0 0 10px', lineHeight: 1.4 }}
          >
            {de
              ? 'Wähle oben eine Einschätzung (plus Gewicht) oder trag deine FTP manuell ein — dann können wir deinen Plan bauen.'
              : 'Pick a fitness level (plus weight) above or enter your FTP manually — then we can build your plan.'}
          </p>
        )}
        <Cta
          label={
            ftpIsStarter
              ? de ? 'Startwerte übernehmen' : 'Use starting numbers'
              : de ? 'Passt so' : 'Looks right'
          }
          onClick={onContinue}
          disabled={ftp == null}
        />
        <button
          type="button"
          onClick={() => setAdjusting(!adjusting)}
          className="w-full text-center"
          style={{
            padding: '12px 0 0',
            fontSize: 13,
            fontWeight: 600,
            color: adjusting ? T.accent : T.ink2,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {adjusting
            ? de ? 'Fertig angepasst' : 'Done adjusting'
            : de ? 'Manuell anpassen' : 'Adjust manually'}
        </button>
      </div>
    </>
  )
}

// ── Screen 3 · Goal & Depth ─────────────────────────────────────────────────

function GoalDepthScreen({
  de,
  profileEvent,
  goal,
  setGoal,
  eventName,
  setEventName,
  eventDate,
  setEventDate,
  depth,
  setDepth,
  hours,
  setHours,
  days,
  toggleDay,
  error,
  errorKind,
  onGoToNumbers,
  submitting,
  onFinish,
}: {
  de: boolean
  profileEvent: { name: string; date: string | null; type: string | null } | null
  goal: GoalMode | null
  setGoal: (g: GoalMode) => void
  eventName: string
  setEventName: (v: string) => void
  eventDate: string
  setEventDate: (v: string) => void
  depth: Depth
  setDepth: (d: Depth) => void
  hours: number
  setHours: (h: number) => void
  days: Record<Weekday, boolean>
  toggleDay: (d: Weekday) => void
  error: string | null
  errorKind: 'ftp' | 'generic' | null
  onGoToNumbers: () => void
  submitting: boolean
  onFinish: () => void
}) {
  const labels = de ? WEEKDAY_LABELS_DE : WEEKDAY_LABELS_EN

  const goalCard = (
    key: GoalMode,
    icon: ReactNode,
    title: string,
    sub: string,
    displayFont = false,
  ) => {
    const selected = goal === key
    return (
      <button
        type="button"
        onClick={() => setGoal(key)}
        className="flex items-center w-full text-left"
        style={{
          gap: 12,
          padding: '16px 18px',
          borderRadius: 24,
          backgroundColor: selected ? T.accentSoft : T.surface,
          border: `1px solid ${selected ? T.accent : T.border}`,
          cursor: 'pointer',
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 44,
            height: 44,
            borderRadius: 100,
            backgroundColor: selected ? T.accent : T.surface2,
          }}
        >
          {icon}
        </div>
        <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
          <span
            style={{
              fontFamily: displayFont ? T.display : T.body,
              fontSize: displayFont ? 16 : 15,
              fontWeight: 700,
              color: T.ink,
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: T.ink2 }}>{sub}</span>
        </div>
        {selected && (
          <CheckCircle2 size={22} strokeWidth={2.2} className="shrink-0" style={{ color: T.accent }} />
        )}
      </button>
    )
  }

  const depthOptions: Array<{ key: Depth; title: string; sub: string }> = [
    { key: 'guide', title: de ? 'Begleite mich' : 'Guide me', sub: de ? 'Einfache Sprache' : 'Plain language' },
    { key: 'numbers', title: de ? 'Zeig Zahlen' : 'Show numbers', sub: de ? 'Zonen & TSS' : 'Zones & TSS' },
    { key: 'pro', title: de ? 'Voll Pro' : 'Full pro', sub: de ? 'Jede Metrik' : 'Every metric' },
  ]

  return (
    <>
      <TitleBlock
        overline={de ? 'EIN ZIEL, EINE SAISON' : 'ONE GOAL, ONE SEASON'}
        title={de ? 'Wo soll’s hingehen?' : 'Where are we headed?'}
      />

      <div className="flex flex-col" style={{ gap: 12 }}>
        {profileEvent &&
          goalCard(
            'event',
            <Flag
              size={22}
              strokeWidth={2.2}
              style={{ color: goal === 'event' ? '#FFFFFF' : T.ink2 }}
            />,
            profileEvent.name,
            [
              profileEvent.date &&
                new Date(profileEvent.date).toLocaleDateString(de ? 'de-DE' : 'en-US', {
                  day: 'numeric',
                  month: 'short',
                }),
              profileEvent.type,
            ]
              .filter(Boolean)
              .join(' · ') || (de ? 'Dein gesetztes Ziel-Event' : 'Your saved target event'),
            true,
          )}
        {goalCard(
          'fitter',
          <TrendingUp
            size={22}
            strokeWidth={2.2}
            style={{ color: goal === 'fitter' ? '#FFFFFF' : T.ink2 }}
          />,
          de ? 'Einfach fitter werden' : 'Just get fitter',
          de
            ? 'Kein Rennen — wir bauen den Motor und setzen die Meilensteine'
            : 'No race — build the engine, we set the milestones',
        )}
        {goalCard(
          'custom',
          <CalendarPlus
            size={22}
            strokeWidth={2.2}
            style={{ color: goal === 'custom' ? '#FFFFFF' : T.ink2 }}
          />,
          de ? 'Ein eigenes Event' : 'A custom event',
          de
            ? 'Datum & Distanz — wir planen rückwärts'
            : 'Tell us date & distance, we build backwards',
        )}
        {goal === 'custom' && (
          <div className="flex" style={{ gap: 8 }}>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder={de ? 'Event-Name' : 'Event name'}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            />
          </div>
        )}
      </div>

      {/* Depth selector */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: T.ink2 }}>
          {de ? 'WIE VIEL DETAIL WILLST DU?' : 'HOW MUCH DETAIL DO YOU WANT?'}
        </span>
        <div className="flex" style={{ gap: 8 }}>
          {depthOptions.map((o) => {
            const selected = depth === o.key
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setDepth(o.key)}
                className="flex flex-col items-center flex-1"
                style={{
                  gap: 3,
                  padding: '12px 0',
                  borderRadius: 16,
                  backgroundColor: selected ? T.accentSoft : T.surface,
                  border: `1px solid ${selected ? T.accent : T.border}`,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: selected ? T.accent : T.ink }}>
                  {o.title}
                </span>
                <span style={{ fontSize: 10, fontWeight: 500, color: selected ? T.ink2 : T.ink3 }}>
                  {o.sub}
                </span>
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.ink3 }}>
          {de
            ? 'Jederzeit in den Einstellungen änderbar — gleiche Screens, mehr Tiefe.'
            : 'Changes anytime in Settings — same screens, layered depth.'}
        </span>
      </div>

      {/* Hours + days — the challenge-doc feasibility rows */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: T.ink2 }}>
          {de ? 'WIE VIEL ZEIT HAST DU?' : 'HOW MUCH TIME DO YOU HAVE?'}
        </span>
        <div
          className="flex flex-col"
          style={{
            backgroundColor: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 24,
            padding: '14px 16px',
            gap: 14,
          }}
        >
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                {de ? 'Stunden pro Woche' : 'Hours per week'}
              </span>
              <span
                style={{
                  fontFamily: T.display,
                  fontSize: 15,
                  fontWeight: 700,
                  color: T.accent,
                }}
              >
                {hours} h
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-accent)' }}
            />
          </div>
          <div className="flex flex-col" style={{ gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
              {de ? 'Trainingstage' : 'Training days'}
            </span>
            <div className="flex" style={{ gap: 6 }}>
              {WEEKDAYS.map((d) => {
                const on = days[d]
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className="flex-1 text-center"
                    style={{
                      padding: '9px 0',
                      borderRadius: 12,
                      backgroundColor: on ? T.accentSoft : T.surface2,
                      border: `1px solid ${on ? T.accent : T.border}`,
                      color: on ? T.accent : T.ink3,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {labels[d]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="flex flex-col"
          role="alert"
          style={{
            gap: 10,
            padding: '12px 14px',
            borderRadius: 16,
            backgroundColor: 'rgba(255, 90, 60, 0.08)',
            border: '1px solid rgba(255, 90, 60, 0.35)',
          }}
        >
          <p style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--color-bad)', margin: 0, fontWeight: 600 }}>
            {error}
          </p>
          {errorKind === 'ftp' && (
            <button
              type="button"
              onClick={onGoToNumbers}
              className="self-start"
              style={{
                padding: '8px 14px',
                borderRadius: 100,
                backgroundColor: T.surface3,
                color: T.ink,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {de ? 'Zu meinen Startwerten' : 'Fix my starting numbers'}
            </button>
          )}
        </div>
      )}

      <div className="mt-auto">
        <Cta
          label={
            error
              ? de ? 'Erneut versuchen' : 'Try again'
              : de ? 'Plan erstellen' : 'Build my plan'
          }
          icon={<Rocket size={18} strokeWidth={2.2} />}
          onClick={onFinish}
          disabled={goal === null}
          busy={submitting}
        />
      </div>
    </>
  )
}

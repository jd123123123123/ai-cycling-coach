/**
 * ProfileView — /profile — the rider hub.
 *
 * A cohesive, discoverable home for the athlete's identity and the values that
 * drive the engine, built in the V3 "Profile & Settings" visual language
 * (pencil-new.pen, node iYLSd): NavRow → coral ProfileCard → BODY & ENGINE →
 * POWER → CONNECTIONS → TARGET EVENT.
 *
 * From here the rider reaches every related surface one clear tap away:
 *   • Power Profile (/power-profile) — their power curve
 *   • Connections + full Settings (/settings, /garmin/connect)
 *
 * Picture + name persist via PATCH /users/me (updateUser); the core stats via
 * PUT /athletes/me (updateProfile). Honest "—" where data is absent. Mobile-
 * first, WHOOP tokens, de/en via the locale pattern.
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Heart,
  LineChart,
  Loader2,
  MonitorSmartphone,
  Pencil,
  SlidersHorizontal,
  Timer,
  Watch,
  type LucideIcon,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import DashboardShell from '../components/dashboard/DashboardShell'
import TargetEventEditor from '../components/dashboard/TargetEventEditor'
import { useLocale } from '../contexts/LocaleContext'
import { useAuth } from '../contexts/AuthContext'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useGarminStatus } from '../hooks/useGarminStatus'
import { useWahooStatus } from '../hooks/useWahooStatus'
import { useCorosStatus } from '../hooks/useCorosStatus'
import { updateUser } from '../api/auth'
import { updateProfile } from '../api/athletes'
import type { AthleteProfileUpdate } from '../types/athlete'

const DISPLAY_FONT = '"Sora", "Inter", ui-sans-serif, sans-serif'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Resize/center-crop a picked image to a square 256×256 JPEG data: URL (small,
// ≤~200 KB). We never upload the raw file — only this compact base64 string.
function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        const size = 256
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('no canvas context'))
          return
        }
        // Center-crop to a square, then scale down to 256×256.
        const min = Math.min(img.width, img.height)
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// pace: backend stores threshold running speed in m/s; humans read mm:ss /km.
function msToPaceStr(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return ''
  const secPerKm = 1000 / ms
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function paceStrToMs(str: string): number | undefined {
  const t = str.trim()
  if (!t) return undefined
  const parts = t.split(':')
  if (parts.length !== 2) return undefined
  const m = parseInt(parts[0], 10)
  const s = parseInt(parts[1], 10)
  if (isNaN(m) || isNaN(s)) return undefined
  const secPerKm = m * 60 + s
  if (secPerKm <= 0) return undefined
  return 1000 / secPerKm
}

export default function ProfileView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()
  const { data: profile } = useAthleteProfile()
  const { data: garmin } = useGarminStatus()
  const { data: wahoo } = useWahooStatus()
  const { data: coros } = useCorosStatus()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/dashboard?tab=today')
  }

  // ---- Identity (name + avatar) — PATCH /users/me ----
  const [editingId, setEditingId] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarState, setAvatarState] = useState<SaveState>('idle')
  const [nameState, setNameState] = useState<SaveState>('idle')

  useEffect(() => {
    if (user?.display_name != null) setDisplayName(user.display_name)
  }, [user?.display_name])

  const name = user?.display_name || user?.email?.split('@')[0] || (de ? 'Athlet' : 'Athlete')
  const initial = name.charAt(0).toUpperCase()

  // Identity subtitle from real engine values — honest, never fabricated.
  const wkg =
    profile?.ftp_watts != null && profile?.weight_kg != null && profile.weight_kg > 0
      ? profile.ftp_watts / profile.weight_kg
      : null
  const subtitle =
    profile?.ftp_watts != null
      ? `${profile.ftp_watts} W${wkg != null ? ` · ${(de ? wkg.toFixed(1).replace('.', ',') : wkg.toFixed(1))} W/kg` : ''}`
      : user?.email ?? (de ? 'Profil vervollständigen' : 'Complete your profile')

  const handlePickFile = () => fileInputRef.current?.click()

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setAvatarState('saving')
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      await updateUser({ avatar_url: dataUrl })
      await refreshUser()
      setAvatarState('saved')
      setTimeout(() => setAvatarState('idle'), 2000)
    } catch {
      setAvatarState('error')
    }
  }

  const handleSaveName = async () => {
    setNameState('saving')
    try {
      await updateUser({ display_name: displayName.trim() || null })
      await refreshUser()
      setNameState('saved')
      setTimeout(() => setNameState('idle'), 2000)
    } catch {
      setNameState('error')
    }
  }

  // ---- Stats — PUT /athletes/me ----
  const [ftp, setFtp] = useState('')
  const [weight, setWeight] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [lthrCycling, setLthrCycling] = useState('')
  const [lthrRunning, setLthrRunning] = useState('')
  const [pace, setPace] = useState('')
  const [weeklyHours, setWeeklyHours] = useState('')
  const [statsState, setStatsState] = useState<SaveState>('idle')

  useEffect(() => {
    if (!profile) return
    setFtp(profile.ftp_watts != null ? String(profile.ftp_watts) : '')
    setWeight(profile.weight_kg != null ? String(profile.weight_kg) : '')
    setMaxHr(profile.max_heart_rate != null ? String(profile.max_heart_rate) : '')
    setLthrCycling(profile.lthr_cycling != null ? String(profile.lthr_cycling) : '')
    setLthrRunning(profile.lthr_running != null ? String(profile.lthr_running) : '')
    setPace(msToPaceStr(profile.running_threshold_pace_ms))
    setWeeklyHours(profile.weekly_hours_available != null ? String(profile.weekly_hours_available) : '')
  }, [profile])

  const handleSaveStats = async () => {
    setStatsState('saving')
    try {
      const intOrNull = (v: string): number | undefined => {
        const n = parseInt(v, 10)
        return isNaN(n) ? undefined : n
      }
      const numOrNull = (v: string): number | undefined => {
        const n = parseFloat(v)
        return isNaN(n) ? undefined : n
      }
      const payload: AthleteProfileUpdate = {
        ftp_watts: intOrNull(ftp),
        weight_kg: numOrNull(weight),
        max_heart_rate: intOrNull(maxHr),
        lthr_cycling: intOrNull(lthrCycling),
        lthr_running: intOrNull(lthrRunning),
        running_threshold_pace_ms: paceStrToMs(pace),
        weekly_hours_available: numOrNull(weeklyHours),
      }
      await updateProfile(payload)
      await queryClient.invalidateQueries({ queryKey: ['athlete', 'me'] })
      setStatsState('saved')
      setTimeout(() => setStatsState('idle'), 2000)
    } catch {
      setStatsState('error')
    }
  }

  // Connection status → label + tone, mirroring the Settings screen.
  const connectedLabel = de ? 'Verbunden' : 'Connected'
  const connectLabel = de ? 'Verbinden' : 'Connect'
  const soonLabel = de ? 'Bald verfügbar' : 'Coming soon'

  return (
    <DashboardShell>
      <div className="flex flex-col gap-5 pb-10">
        {/* NavRow (pen Fb0TE) */}
        <div className="flex items-center gap-2.5 -mt-1">
          <button
            type="button"
            onClick={goBack}
            aria-label={de ? 'Zurück' : 'Back'}
            className="flex items-center justify-center -ml-1 p-1"
          >
            <ArrowLeft size={24} strokeWidth={2} style={{ color: 'var(--color-ink)' }} />
          </button>
          <h1 className="text-[20px] font-bold" style={{ color: 'var(--color-ink)', fontFamily: DISPLAY_FONT }}>
            {de ? 'Mein Profil' : 'My profile'}
          </h1>
        </div>

        {/* ProfileCard (pen bsy4b) — coral avatar, name, identity subtitle, edit */}
        <div
          className="flex flex-col gap-4 w-full rounded-[24px] p-[18px]"
          style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <div className="flex items-center gap-3.5">
            {/* Avatar — tap to change picture */}
            <button
              type="button"
              onClick={handlePickFile}
              aria-label={de ? 'Bild ändern' : 'Change picture'}
              className="relative flex items-center justify-center rounded-full overflow-hidden shrink-0"
              style={{ width: 64, height: 64, backgroundColor: 'var(--color-accent)' }}
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="text-[26px] font-bold text-white" style={{ fontFamily: DISPLAY_FONT }}>
                  {initial}
                </span>
              )}
              <span
                className="absolute bottom-0 inset-x-0 flex items-center justify-center py-1"
                style={{ background: 'color-mix(in srgb, #000 45%, transparent)' }}
              >
                <Camera size={13} strokeWidth={2} style={{ color: '#fff' }} />
              </span>
            </button>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span
                className="text-[18px] font-bold truncate"
                style={{ color: 'var(--color-ink)', fontFamily: DISPLAY_FONT }}
              >
                {name}
              </span>
              <span className="text-[12px] font-medium truncate" style={{ color: 'var(--color-ink-2)' }}>
                {subtitle}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditingId((v) => !v)}
              className="flex items-center gap-1 rounded-full px-3.5 py-2 text-[12px] font-bold shrink-0"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-ink)' }}
            >
              <Pencil size={12} strokeWidth={2.5} />
              {de ? 'Bearbeiten' : 'Edit'}
            </button>
          </div>

          {/* Inline identity editor — name + picture, PATCH /users/me */}
          {editingId && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="h-px w-full" style={{ backgroundColor: 'var(--color-rule)' }} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold" style={{ color: 'var(--color-muted)', letterSpacing: '0.18em' }}>
                  {de ? 'NAME' : 'NAME'}
                </span>
                <input
                  type="text"
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={de ? 'Wie sollen wir dich nennen?' : 'What should we call you?'}
                  className="w-full px-3 py-2.5 text-[14px] rounded-[10px] focus:outline-none"
                  style={{ background: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', caretColor: 'var(--color-accent)' }}
                />
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={nameState === 'saving'}
                  className="text-[13px] font-medium rounded-full px-4 py-1.5"
                  style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)', opacity: nameState === 'saving' ? 0.6 : 1 }}
                >
                  {de ? 'Name speichern' : 'Save name'}
                </button>
                <button
                  type="button"
                  onClick={handlePickFile}
                  className="text-[13px] font-medium rounded-full px-4 py-1.5"
                  style={{ border: '1px solid var(--color-rule)', color: 'var(--color-ink)', backgroundColor: 'var(--color-paper)' }}
                >
                  {de ? 'Bild hochladen' : 'Upload picture'}
                </button>
              </div>
              <div className="flex items-center gap-4">
                <StatusLine state={nameState} de={de} />
                <StatusLine state={avatarState} de={de} />
              </div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </div>

        {/* BODY & ENGINE — the editable core stats that anchor the engine */}
        <Section label={de ? 'KÖRPER & MOTOR' : 'BODY & ENGINE'}>
          <p className="text-[12.5px] pt-3 pb-1" style={{ color: 'var(--color-ink-2)' }}>
            {de
              ? 'Diese Werte steuern deine Zonen, den Load und die Coach-Empfehlungen.'
              : 'These anchor your zones, load, and the coach recommendations.'}
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <StatField label={de ? 'FTP' : 'FTP'} unit="W" value={ftp} onChange={setFtp} placeholder="250" />
            <StatField label={de ? 'Gewicht' : 'Weight'} unit="kg" value={weight} onChange={setWeight} step={0.1} placeholder="75" />
            <StatField label={de ? 'Max. HF' : 'Max HR'} unit="bpm" value={maxHr} onChange={setMaxHr} placeholder="185" />
            <StatField label={de ? 'LTHR Rad' : 'LTHR cycling'} unit="bpm" value={lthrCycling} onChange={setLthrCycling} placeholder="165" />
            <StatField label={de ? 'LTHR Laufen' : 'LTHR running'} unit="bpm" value={lthrRunning} onChange={setLthrRunning} placeholder="170" />
            <StatField label={de ? 'Schwellen-Pace' : 'Threshold pace'} unit="min/km" value={pace} onChange={setPace} type="text" placeholder="4:30" />
            <StatField label={de ? 'Wochenstunden' : 'Weekly hours'} unit="h" value={weeklyHours} onChange={setWeeklyHours} step={0.5} placeholder="8" />
          </div>
          <div className="flex items-center gap-3 pt-2 pb-3">
            <button
              type="button"
              onClick={handleSaveStats}
              disabled={statsState === 'saving'}
              className="text-[13px] font-medium rounded-full px-4 py-2"
              style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)', opacity: statsState === 'saving' ? 0.6 : 1 }}
            >
              {de ? 'Werte speichern' : 'Save stats'}
            </button>
            <StatusLine state={statsState} de={de} />
          </div>
        </Section>

        {/* POWER — prominent one-tap link to the power curve */}
        <section className="flex flex-col gap-2 w-full">
          <span className="text-[11px] font-bold" style={{ color: '#5C6570', letterSpacing: '1.4px' }}>
            {de ? 'LEISTUNG' : 'POWER'}
          </span>
          <button
            type="button"
            onClick={() => navigate('/power-profile')}
            className="flex items-center gap-3.5 w-full rounded-[24px] p-[18px] text-left transition-opacity active:opacity-80"
            style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
          >
            <div
              className="flex items-center justify-center rounded-[16px] shrink-0"
              style={{ width: 44, height: 44, backgroundColor: 'var(--color-accent-soft)' }}
            >
              <LineChart size={22} strokeWidth={2} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="text-[15px] font-bold" style={{ color: 'var(--color-ink)', fontFamily: DISPLAY_FONT }}>
                {de ? 'Power-Profil' : 'Power profile'}
              </span>
              <span className="text-[12.5px] font-medium" style={{ color: 'var(--color-ink-2)' }}>
                {de ? 'Deine Leistungskurve & Zonen' : 'Your power curve & zones'}
              </span>
            </div>
            <ChevronRight size={20} strokeWidth={2} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
          </button>
        </section>

        {/* CONNECTIONS — status summary, full control in Settings */}
        <Section label={de ? 'VERBINDUNGEN' : 'CONNECTIONS'}>
          {[
            <Row
              key="garmin"
              icon={Watch}
              label="Garmin"
              value={garmin?.connected ? connectedLabel : connectLabel}
              tone={garmin?.connected ? 'good' : 'accent'}
              onClick={() => navigate('/garmin/connect')}
            />,
            <Row
              key="wahoo"
              icon={MonitorSmartphone}
              label="Wahoo"
              value={wahoo?.connected ? connectedLabel : connectLabel}
              tone={wahoo?.connected ? 'good' : 'accent'}
              onClick={() => navigate('/settings')}
            />,
            <Row
              key="coros"
              icon={Timer}
              label="COROS"
              value={coros?.connected ? connectedLabel : coros?.configured ? connectLabel : soonLabel}
              tone={coros?.connected ? 'good' : coros?.configured ? 'accent' : 'muted'}
              onClick={() => navigate('/settings')}
            />,
            <Row
              key="apple"
              icon={Heart}
              label="Apple Health"
              value={soonLabel}
              tone="muted"
            />,
          ]}
        </Section>

        {/* Full settings entry */}
        <section className="flex flex-col gap-2 w-full">
          <div
            className="flex flex-col w-full px-[18px] py-1 rounded-[24px]"
            style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
          >
            <Row
              icon={SlidersHorizontal}
              label={de ? 'Alle Einstellungen' : 'All settings'}
              value={de ? 'Detailgrad, Benachrichtigungen …' : 'Detail level, notifications …'}
              tone="muted"
              onClick={() => navigate('/settings')}
            />
          </div>
        </section>

        {/* TARGET EVENT — reuse the shared editor */}
        <TargetEventEditor />
      </div>
    </DashboardShell>
  )
}

// ── Row primitive (pen Row-*, padding [13,0], gap 12) ───────────────────────

type RowValueTone = 'good' | 'accent' | 'muted'
const TONE_COLOR: Record<RowValueTone, string> = {
  good: 'var(--color-recovery)',
  accent: 'var(--color-accent)',
  muted: 'var(--color-muted)',
}

function Row({
  icon: Icon,
  label,
  value,
  tone = 'muted',
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: RowValueTone
  onClick?: () => void
}) {
  const inner = (
    <>
      <Icon size={20} strokeWidth={2} style={{ color: 'var(--color-ink-2)', flexShrink: 0 }} />
      <span className="flex-1 text-left text-[14px] font-semibold" style={{ color: 'var(--color-ink)' }}>
        {label}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: TONE_COLOR[tone] }}>
        {value}
      </span>
      {onClick && <ChevronRight size={18} strokeWidth={2} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />}
    </>
  )
  if (!onClick) return <div className="flex items-center gap-3 py-[13px] w-full">{inner}</div>
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 py-[13px] w-full">
      {inner}
    </button>
  )
}

/** Pen Sec-* — 11px/700 tracked label above a $surface card, rows divided. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  const rows = items.filter(Boolean)
  const isRowList = rows.length > 0 && rows.every((c) => c != null && typeof c === 'object' && 'key' in (c as object))
  return (
    <section className="flex flex-col gap-2 w-full">
      <span className="text-[11px] font-bold" style={{ color: '#5C6570', letterSpacing: '1.4px' }}>
        {label}
      </span>
      <div
        className="flex flex-col w-full px-[18px] py-1 rounded-[24px]"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        {isRowList
          ? (rows as ReactNode[]).flatMap((child, i) =>
              i === 0 ? [child] : [<Divider key={`div-${i}`} />, child],
            )
          : children}
      </div>
    </section>
  )
}

function Divider() {
  return <div className="h-px w-full" style={{ backgroundColor: 'var(--color-rule)' }} />
}

function StatusLine({ state, de }: { state: SaveState; de: boolean }) {
  if (state === 'idle') return null
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--color-muted)' }}>
        <Loader2 size={13} className="animate-spin" strokeWidth={2} />
        {de ? 'Speichern…' : 'Saving…'}
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--color-recovery)' }}>
        <Check size={13} strokeWidth={2.5} />
        {de ? 'Gespeichert' : 'Saved'}
      </span>
    )
  }
  return (
    <span className="text-[12px]" style={{ color: 'var(--color-move)' }}>
      {de ? 'Speichern fehlgeschlagen' : 'Save failed'}
    </span>
  )
}

function StatField({
  label,
  unit,
  value,
  onChange,
  step,
  placeholder,
  type = 'number',
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  step?: number
  placeholder?: string
  type?: 'number' | 'text'
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold" style={{ color: 'var(--color-muted)', letterSpacing: '0.14em' }}>
        {label}
      </span>
      <div
        className="flex items-center rounded-[10px] overflow-hidden"
        style={{ background: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}
      >
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : 'text'}
          step={step}
          min={type === 'number' ? 0 : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3 py-2.5 text-[14px] bg-transparent focus:outline-none"
          style={{ color: 'var(--color-ink)', caretColor: 'var(--color-accent)' }}
        />
        <span className="px-2.5 text-[12px] shrink-0" style={{ color: 'var(--color-muted)' }}>{unit}</span>
      </div>
    </label>
  )
}

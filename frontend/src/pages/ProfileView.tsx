/**
 * ProfileView — /profile
 *
 * The athlete's own profile: picture, display name, and the core training stats
 * that drive the engine (FTP, weight, HR anchors, threshold pace, weekly hours),
 * plus their target event. Picture + name persist via PATCH /users/me; stats via
 * PUT /athletes/me. Mobile-first, WHOOP tokens, de/en via the locale pattern.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Check, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import DashboardShell from '../components/dashboard/DashboardShell'
import TargetEventEditor from '../components/dashboard/TargetEventEditor'
import { useLocale } from '../contexts/LocaleContext'
import { useAuth } from '../contexts/AuthContext'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { updateUser } from '../api/auth'
import { updateProfile } from '../api/athletes'
import type { AthleteProfileUpdate } from '../types/athlete'

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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/dashboard?tab=today')
  }

  // ---- Identity (name + avatar) — PATCH /users/me ----
  const [displayName, setDisplayName] = useState('')
  const [avatarState, setAvatarState] = useState<SaveState>('idle')
  const [nameState, setNameState] = useState<SaveState>('idle')

  useEffect(() => {
    if (user?.display_name != null) setDisplayName(user.display_name)
  }, [user?.display_name])

  const initial = (displayName || user?.email || 'A').charAt(0).toUpperCase()

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

  return (
    <DashboardShell>
      <div className="p-6 max-w-2xl mx-auto flex flex-col gap-8 pb-28">
        {/* Back / done */}
        <div className="flex items-center justify-between -mb-2">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 min-h-[40px] transition-colors"
            style={{ fontSize: 13, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', backgroundColor: 'var(--color-paper-2)' }}
          >
            <ArrowLeft size={15} strokeWidth={2} />
            {de ? 'Zurück' : 'Back'}
          </button>
          <button
            type="button"
            onClick={goBack}
            className="rounded-full px-4 py-1.5 min-h-[40px] text-[13px] font-medium transition-opacity"
            style={{ color: 'var(--color-paper)', backgroundColor: 'var(--color-ink)' }}
          >
            {de ? 'Fertig' : 'Done'}
          </button>
        </div>

        <div>
          <span className="eyebrow" style={{ color: 'var(--color-amber)', letterSpacing: '0.2em' }}>
            {de ? 'Profil' : 'Profile'}
          </span>
          <h1
            className="num-display mt-2 leading-tight"
            style={{ fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--color-ink)' }}
          >
            {de ? 'Dein Profil' : 'Your profile'}
          </h1>
        </div>

        {/* Picture + name */}
        <section
          className="flex flex-col gap-5 p-5 rounded-[16px]"
          style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <div className="flex items-center gap-4">
            {/* Avatar with upload control */}
            <button
              type="button"
              onClick={handlePickFile}
              className="relative shrink-0 grid place-items-center rounded-full overflow-hidden"
              style={{ width: 72, height: 72, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
              aria-label={de ? 'Bild ändern' : 'Change picture'}
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)' }}>{initial}</span>
              )}
              <span
                className="absolute bottom-0 inset-x-0 flex items-center justify-center py-1"
                style={{ background: 'color-mix(in srgb, var(--color-ink) 55%, transparent)' }}
              >
                <Camera size={13} strokeWidth={2} style={{ color: 'var(--color-paper)' }} />
              </span>
            </button>
            <div className="flex flex-col gap-1">
              <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>
                {de ? 'BILD' : 'PICTURE'}
              </span>
              <button
                type="button"
                onClick={handlePickFile}
                className="text-[13px] font-medium self-start rounded-full px-3 py-1.5"
                style={{ border: '1px solid var(--color-rule)', color: 'var(--color-ink)', backgroundColor: 'var(--color-paper)' }}
              >
                {de ? 'Bild hochladen' : 'Upload picture'}
              </button>
              <StatusLine state={avatarState} de={de} />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Name */}
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>
              {de ? 'NAME' : 'NAME'}
            </span>
            <input
              type="text"
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={de ? 'Wie sollen wir dich nennen?' : 'What should we call you?'}
              className="w-full px-3 py-2.5 text-[14px] rounded-md focus:outline-none focus:ring-1"
              style={{ background: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', caretColor: 'var(--color-forest-2)' }}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveName}
                disabled={nameState === 'saving'}
                className="text-[13px] font-medium self-start rounded-full px-4 py-1.5"
                style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)', opacity: nameState === 'saving' ? 0.6 : 1 }}
              >
                {de ? 'Name speichern' : 'Save name'}
              </button>
              <StatusLine state={nameState} de={de} />
            </div>
          </label>
        </section>

        {/* Important stats */}
        <section
          className="flex flex-col gap-4 p-5 rounded-[16px]"
          style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <div className="flex flex-col gap-1">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>
              {de ? 'WICHTIGE WERTE' : 'IMPORTANT STATS'}
            </span>
            <p className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>
              {de
                ? 'Diese Werte steuern Zonen, Load und die Coach-Empfehlungen.'
                : 'These anchor your zones, load, and the coach recommendations.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatField label={de ? 'FTP' : 'FTP'} unit="W" value={ftp} onChange={setFtp} placeholder="250" />
            <StatField label={de ? 'Gewicht' : 'Weight'} unit="kg" value={weight} onChange={setWeight} step={0.1} placeholder="75" />
            <StatField label={de ? 'Max. Herzfrequenz' : 'Max heart rate'} unit="bpm" value={maxHr} onChange={setMaxHr} placeholder="185" />
            <StatField label={de ? 'LTHR Rad' : 'LTHR cycling'} unit="bpm" value={lthrCycling} onChange={setLthrCycling} placeholder="165" />
            <StatField label={de ? 'LTHR Laufen' : 'LTHR running'} unit="bpm" value={lthrRunning} onChange={setLthrRunning} placeholder="170" />
            <StatField
              label={de ? 'Schwellen-Pace' : 'Threshold pace'}
              unit={de ? 'min/km' : 'min/km'}
              value={pace}
              onChange={setPace}
              type="text"
              placeholder="4:30"
            />
            <StatField label={de ? 'Wochenstunden' : 'Weekly hours'} unit="h" value={weeklyHours} onChange={setWeeklyHours} step={0.5} placeholder="8" />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveStats}
              disabled={statsState === 'saving'}
              className="text-[13px] font-medium self-start rounded-full px-4 py-2"
              style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)', opacity: statsState === 'saving' ? 0.6 : 1 }}
            >
              {de ? 'Werte speichern' : 'Save stats'}
            </button>
            <StatusLine state={statsState} de={de} />
          </div>
        </section>

        {/* Target event — reuse the shared editor */}
        <TargetEventEditor />
      </div>
    </DashboardShell>
  )
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
    <span className="text-[12px]" style={{ color: 'var(--color-alert)' }}>
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
      <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.18em', fontSize: 10 }}>
        {label}
      </span>
      <div
        className="flex items-center rounded-md overflow-hidden"
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
          style={{ color: 'var(--color-ink)', caretColor: 'var(--color-forest-2)' }}
        />
        <span className="px-3 text-[12px] shrink-0" style={{ color: 'var(--color-muted)' }}>{unit}</span>
      </div>
    </label>
  )
}

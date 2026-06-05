import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { Check, ChevronLeft, ChevronRight, Activity, HeartPulse, Zap, CalendarDays, Gauge, Sparkles, Loader2 } from 'lucide-react'
import { subDays } from 'date-fns'
import { useLocale } from '../../contexts/LocaleContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { apiClient } from '../../api/client'
import { grantConsent } from '../../api/consent'
import { CONSENT_TYPES } from '../../types/consent'
import { updateProfile, updateGoals } from '../../api/athletes'
import {
  ageFromDob,
  predictedMaxHr,
  powerZones,
  hrZones,
  estimateFtp,
  observedMaxHr,
  observedRestingHr,
  sessionSplit,
  TRAINING_MODELS,
  type TrainingModel,
  type Zone,
} from '../../utils/trainingScience'

/**
 * OnboardingWizard — the science-based new-user flow.
 *
 * One guided path: consent → connect Garmin → you (physiology) → thresholds &
 * zones (auto-estimated, editable) → availability → goal → weekly intensity →
 * review. Auto-fills FTP / max-HR / resting-HR from synced history, derives
 * Coggan power zones + Karvonen HR zones live, and persists everything (consent
 * + profile + goals) on finish before routing to the dashboard.
 */

type Sex = 'male' | 'female' | ''
type EventType = '' | 'race' | 'fondo' | 'audax' | 'maintenance'
type Priority = '' | 'A' | 'B' | 'C'

interface Form {
  consent: Record<string, boolean>
  dob: string
  sex: Sex
  weight: string
  maxHr: string
  restHr: string
  ftp: string
  primarySport: string
  daysPerWeek: number
  weeklyHours: number
  eventName: string
  eventDate: string
  eventType: EventType
  eventPriority: Priority
  model: TrainingModel
}

const STEP_META = [
  { key: 'welcome', icon: Sparkles },
  { key: 'garmin', icon: Activity },
  { key: 'you', icon: HeartPulse },
  { key: 'zones', icon: Zap },
  { key: 'availability', icon: CalendarDays },
  { key: 'goal', icon: Gauge },
  { key: 'intensity', icon: Activity },
  { key: 'review', icon: Check },
] as const

export default function OnboardingWizard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: profile } = useAthleteProfile()
  const today = useMemo(() => new Date(), [])
  const ninetyAgo = useMemo(() => subDays(today, 90), [today])
  const thirtyAgo = useMemo(() => subDays(today, 30), [today])
  const { data: actsData } = useActivitiesRange(ninetyAgo, today)
  const { data: metricsData } = useDailyMetrics(thirtyAgo, today)
  const { data: garmin } = useGarminStatus()

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<Form>({
    consent: Object.fromEntries(CONSENT_TYPES.map((c) => [c.type, c.required])),
    dob: '',
    sex: '',
    weight: '',
    maxHr: '',
    restHr: '',
    ftp: '',
    primarySport: 'cycling',
    daysPerWeek: 4,
    weeklyHours: 8,
    eventName: '',
    eventDate: '',
    eventType: '',
    eventPriority: '',
    model: 'polarized',
  })

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // ── Prefill from profile + synced history once data is available ──────────
  const [prefilled, setPrefilled] = useState(false)
  const estFtp = useMemo(() => estimateFtp(actsData?.activities ?? []), [actsData])
  const obsMaxHr = useMemo(() => observedMaxHr(actsData?.activities ?? []), [actsData])
  const obsRestHr = useMemo(() => observedRestingHr(metricsData?.metrics ?? []), [metricsData])

  useEffect(() => {
    if (prefilled) return
    // Wait until at least the profile request settled (profile may be null).
    setForm((f) => {
      const next = { ...f }
      if (profile?.date_of_birth && !next.dob) next.dob = profile.date_of_birth
      if (profile?.weight_kg && !next.weight) next.weight = String(profile.weight_kg)
      if (profile?.primary_sport) next.primarySport = profile.primary_sport
      if (!next.ftp) {
        if (profile?.ftp_watts) next.ftp = String(profile.ftp_watts)
        else if (estFtp) next.ftp = String(estFtp.watts)
      }
      if (!next.maxHr) {
        const age = ageFromDob(profile?.date_of_birth ?? next.dob)
        next.maxHr = String(profile?.max_heart_rate ?? obsMaxHr ?? predictedMaxHr(age) ?? '')
      }
      if (!next.restHr) next.restHr = String(profile?.resting_heart_rate ?? obsRestHr ?? '')
      if (profile?.weekly_hours_available) next.weeklyHours = profile.weekly_hours_available
      return next
    })
    // Mark prefilled once we've had a chance with both profile and estimates.
    if (profile !== undefined && actsData !== undefined) setPrefilled(true)
  }, [profile, actsData, estFtp, obsMaxHr, obsRestHr, prefilled])

  const ftpNum = Number(form.ftp) || null
  const maxHrNum = Number(form.maxHr) || null
  const restHrNum = Number(form.restHr) || null
  const pZones = useMemo(() => powerZones(ftpNum), [ftpNum])
  const hZones = useMemo(() => hrZones(maxHrNum, restHrNum), [maxHrNum, restHrNum])
  const split = useMemo(() => sessionSplit(form.model, form.daysPerWeek), [form.model, form.daysPerWeek])

  const canContinue = step !== 0 || CONSENT_TYPES.filter((c) => c.required).every((c) => form.consent[c.type])
  const isLast = step === STEP_META.length - 1

  async function handleFinish() {
    setSubmitting(true)
    setError(null)
    try {
      // 1) Consent grants for everything checked.
      for (const c of CONSENT_TYPES) {
        if (form.consent[c.type]) {
          await grantConsent({
            consent_type: c.type,
            consent_version: '1.0',
            granted: true,
            consent_text: c.description,
          })
        }
      }

      // 2) Profile.
      const profileUpdate: Record<string, unknown> = { primary_sport: form.primarySport }
      if (form.ftp) profileUpdate.ftp_watts = Math.round(Number(form.ftp))
      if (form.weight) profileUpdate.weight_kg = Number(form.weight)
      if (form.maxHr) profileUpdate.max_heart_rate = Math.round(Number(form.maxHr))
      if (form.restHr) profileUpdate.resting_heart_rate = Math.round(Number(form.restHr))
      if (form.dob) profileUpdate.date_of_birth = form.dob
      profileUpdate.weekly_hours_available = form.weeklyHours
      if (form.eventType) {
        profileUpdate.target_event_type = form.eventType
        profileUpdate.target_event_date = form.eventDate || null
        if (form.eventPriority) profileUpdate.target_priority = form.eventPriority
      }
      await updateProfile(profileUpdate)

      // 3) Goals (incl. weekly-intensity prefs in the free-form JSON).
      await updateGoals({
        ...(form.eventName ? { target_event_name: form.eventName } : {}),
        ...(form.eventDate ? { target_event_date: form.eventDate } : {}),
        weekly_hours: form.weeklyHours,
        training_model: form.model,
        days_per_week: form.daysPerWeek,
        ...(form.ftp ? { target_ftp: Math.round(Number(form.ftp)) } : {}),
      })

      await qc.invalidateQueries()
      navigate('/dashboard', { replace: true })
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setError(
        status === 401
          ? de ? 'Sitzung abgelaufen — bitte neu anmelden.' : 'Session expired — please sign in again.'
          : de ? 'Speichern fehlgeschlagen. Bitte erneut versuchen.' : 'Could not save. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const stepTitles = de
    ? ['Willkommen', 'Garmin verbinden', 'Über dich', 'Schwellen & Zonen', 'Verfügbarkeit', 'Dein Ziel', 'Wochenintensität', 'Überblick']
    : ['Welcome', 'Connect Garmin', 'About you', 'Thresholds & zones', 'Availability', 'Your goal', 'Weekly intensity', 'Review']

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      {/* Progress rail */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-paper)', borderBottom: '1px solid var(--color-rule)' }}>
        <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-3 flex items-center gap-1.5">
          {STEP_META.map((s, i) => {
            const done = i < step
            const active = i === step
            return (
              <div key={s.key} className="flex-1 flex items-center gap-1.5">
                <div
                  className="h-1.5 flex-1 rounded-full transition-colors"
                  style={{ backgroundColor: done || active ? 'var(--color-forest-2)' : 'var(--color-rule)' }}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-1">
          <span className="eyebrow num-mono" style={{ color: 'var(--color-forest-2)', letterSpacing: '0.28em', fontSize: 11 }}>
            {de ? `Schritt ${step + 1} / ${STEP_META.length}` : `Step ${step + 1} of ${STEP_META.length}`}
          </span>
        </div>
        <h1
          className="mb-6"
          style={{
            fontFamily: '"Fraunces", serif', fontStyle: 'italic',
            fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
            fontSize: 'clamp(30px, 5vw, 46px)', letterSpacing: '-0.025em', lineHeight: 1.05,
          }}
        >
          {stepTitles[step]}
        </h1>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {step === 0 && <WelcomeStep de={de} form={form} set={set} />}
            {step === 1 && <GarminStep de={de} connected={!!garmin?.connected} qc={qc} />}
            {step === 2 && <YouStep de={de} form={form} set={set} predicted={predictedMaxHr(ageFromDob(form.dob))} obsMaxHr={obsMaxHr} obsRestHr={obsRestHr} />}
            {step === 3 && <ZonesStep de={de} form={form} set={set} estFtp={estFtp} pZones={pZones} hZones={hZones} />}
            {step === 4 && <AvailabilityStep de={de} form={form} set={set} />}
            {step === 5 && <GoalStep de={de} form={form} set={set} />}
            {step === 6 && <IntensityStep de={de} form={form} set={set} split={split} />}
            {step === 7 && <ReviewStep de={de} form={form} pZones={pZones} hZones={hZones} split={split} />}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="mt-4 text-[13px]" style={{ color: 'var(--color-alert)' }}>{error}</p>
        )}

        {/* Nav */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-medium"
            style={{ color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', opacity: step === 0 ? 0.4 : 1 }}
          >
            <ChevronLeft size={15} strokeWidth={2} />
            {de ? 'Zurück' : 'Back'}
          </button>

          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canContinue}
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-medium"
              style={{ color: 'var(--color-paper)', backgroundColor: 'var(--color-ink)', opacity: canContinue ? 1 : 0.4 }}
            >
              {de ? 'Weiter' : 'Continue'}
              <ChevronRight size={15} strokeWidth={2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium"
              style={{ color: 'var(--color-paper)', backgroundColor: 'var(--color-forest-2)', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {de ? 'Training starten' : 'Start training'}
            </button>
          )}
        </div>

        {step > 0 && !isLast && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="text-[12px] underline"
              style={{ color: 'var(--color-muted)' }}
            >
              {de ? 'Diesen Schritt überspringen' : 'Skip this step'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[16px] p-5" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.16em' }}>{label}</span>
      {children}
      {hint && <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{hint}</span>}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-paper)',
  border: '1px solid var(--color-rule)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 15,
  color: 'var(--color-ink)',
  width: '100%',
}

function NumInput({ value, onChange, placeholder, suffix }: { value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
      {suffix && (
        <span className="num-mono absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)', fontSize: 12 }}>{suffix}</span>
      )}
    </div>
  )
}

function ZoneTable({ zones, unit }: { zones: Zone[] | null; unit: string }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!zones) return null
  return (
    <div className="flex flex-col gap-1 mt-2">
      {zones.map((z) => (
        <div key={z.z} className="flex items-center justify-between gap-3 text-[12.5px] py-1" style={{ borderBottom: '1px solid var(--color-rule)' }}>
          <span className="num-mono" style={{ color: 'var(--color-muted)', width: 26 }}>Z{z.z}</span>
          <span className="flex-1" style={{ color: 'var(--color-ink)' }}>{de ? z.nameDe : z.name}</span>
          <span className="num-mono" style={{ color: 'var(--color-ink-2)' }}>
            {z.low}{z.high == null ? '+' : `–${z.high}`} {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Steps ───────────────────────────────────────────────────────────────────

function WelcomeStep({ de, form, set }: { de: boolean; form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[15px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
        {de
          ? 'In wenigen Minuten richten wir dein Training wissenschaftlich ein: wir verbinden Garmin, schätzen deine Schwellen aus deinen Daten, leiten deine Trainingszonen ab und bauen deinen Wochenrhythmus.'
          : 'In a few minutes we’ll set up your training on solid science: connect Garmin, estimate your thresholds from your own data, derive your training zones, and shape your weekly rhythm.'}
      </p>
      <Card>
        <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>
          {de ? 'Einwilligung' : 'Consent'}
        </span>
        <div className="flex flex-col gap-3 mt-3">
          {CONSENT_TYPES.map((c) => {
            const checked = form.consent[c.type]
            return (
              <label key={c.type} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={c.required}
                  onChange={(e) => set('consent', { ...form.consent, [c.type]: e.target.checked })}
                  style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--color-forest-2)' }}
                />
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-medium" style={{ color: 'var(--color-ink)' }}>
                    {consentTitle(de, c.type, c.title)}{c.required && <span style={{ color: 'var(--color-muted)' }}> · {de ? 'erforderlich' : 'required'}</span>}
                  </span>
                  <span className="text-[12px] leading-snug" style={{ color: 'var(--color-muted)' }}>
                    {consentDesc(de, c.type, c.description)}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function consentTitle(de: boolean, type: string, fallback: string): string {
  if (!de) return fallback
  return type === 'health_data' ? 'Verarbeitung von Gesundheitsdaten'
    : type === 'coaching_ai' ? 'KI-Coaching'
    : type === 'data_analytics' ? 'Plattform-Analyse'
    : fallback
}
function consentDesc(de: boolean, type: string, fallback: string): string {
  if (!de) return fallback
  return type === 'health_data'
    ? 'Wir verarbeiten deine Gesundheitsdaten (Herzfrequenz, HRV, Schlaf, Körperzusammensetzung) für personalisierte Trainingsempfehlungen. Diese gelten als besondere Kategorie nach DSGVO Art. 9.'
    : type === 'coaching_ai'
    ? 'Wir nutzen deine Trainingshistorie und Körperdaten, um KI-gestützte Coaching-Tipps und Workouts zu erstellen.'
    : type === 'data_analytics'
    ? 'Wir nutzen aggregierte, anonymisierte Daten zur Verbesserung unserer Algorithmen. Deine Einzeldaten werden nie geteilt.'
    : fallback
}

function GarminStep({ de, connected, qc }: { de: boolean; connected: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(connected)
  const [err, setErr] = useState<string | null>(null)

  async function connect() {
    setBusy(true)
    setErr(null)
    try {
      await apiClient.post('/garmin/connect', { email, password })
      await qc.invalidateQueries({ queryKey: ['garmin', 'status'] })
      await qc.invalidateQueries({ queryKey: ['activities'] })
      await qc.invalidateQueries({ queryKey: ['daily-metrics'] })
      await qc.invalidateQueries({ queryKey: ['pmc'] })
      setDone(true)
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setErr(status === 401
        ? de ? 'Anmeldedaten abgelehnt. Bitte erneut versuchen.' : 'Credentials rejected. Please try again.'
        : de ? 'Verbindung fehlgeschlagen.' : 'Connection failed.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, backgroundColor: 'color-mix(in srgb, var(--color-good) 18%, transparent)' }}>
            <Check size={18} strokeWidth={2.4} style={{ color: 'var(--color-good)' }} />
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-medium" style={{ color: 'var(--color-ink)' }}>{de ? 'Garmin verbunden' : 'Garmin connected'}</span>
            <span className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{de ? 'Deine letzten 90 Tage werden ausgewertet, um Schwellen zu schätzen.' : 'Your last 90 days power the threshold estimates ahead.'}</span>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
        {de
          ? 'Verbinde Garmin, damit wir deine Aktivitäten und Erholungsdaten ziehen können — daraus schätzen wir FTP und Herzfrequenz-Werte automatisch.'
          : 'Connect Garmin so we can pull your activities and recovery data — we’ll estimate FTP and heart-rate values from it automatically.'}
      </p>
      <Card>
        <div className="flex flex-col gap-3">
          <Field label={de ? 'Garmin E-Mail' : 'Garmin email'}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" />
          </Field>
          <Field label={de ? 'Garmin Passwort' : 'Garmin password'} hint={de ? 'Verschlüsselt mit einem Schlüssel, den nur dein Server kennt. Erstsync zieht 90 Tage Aktivitäten — bis zu einer Minute.' : 'Encrypted with a key only your server holds. Initial sync pulls 90 days — up to a minute.'}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />
          </Field>
          {err && <span className="text-[12px]" style={{ color: 'var(--color-alert)' }}>{err}</span>}
          <button
            type="button"
            onClick={connect}
            disabled={busy || !email || !password}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium"
            style={{ color: 'var(--color-paper)', backgroundColor: 'var(--color-forest-2)', opacity: busy || !email || !password ? 0.6 : 1 }}
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? (de ? 'Verbinde…' : 'Connecting…') : (de ? 'Garmin verbinden' : 'Connect Garmin')}
          </button>
        </div>
      </Card>
      <p className="text-[12px] text-center" style={{ color: 'var(--color-muted)' }}>
        {de ? 'Kein Garmin? Du kannst diesen Schritt überspringen und Werte manuell eingeben.' : 'No Garmin? You can skip and enter values manually.'}
      </p>
    </div>
  )
}

function YouStep({ de, form, set, predicted, obsMaxHr, obsRestHr }: {
  de: boolean; form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void
  predicted: number | null; obsMaxHr: number | null; obsRestHr: number | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Field label={de ? 'Geburtsdatum' : 'Date of birth'}>
            <input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={de ? 'Geschlecht (für Formeln)' : 'Sex (for formulas)'}>
            <select value={form.sex} onChange={(e) => set('sex', e.target.value as Sex)} style={inputStyle}>
              <option value="">{de ? '— wählen —' : '— select —'}</option>
              <option value="male">{de ? 'männlich' : 'male'}</option>
              <option value="female">{de ? 'weiblich' : 'female'}</option>
            </select>
          </Field>
          <Field label={de ? 'Gewicht' : 'Weight'}>
            <NumInput value={form.weight} onChange={(v) => set('weight', v)} placeholder="72" suffix="kg" />
          </Field>
          <Field label={de ? 'Primärsportart' : 'Primary sport'}>
            <select value={form.primarySport} onChange={(e) => set('primarySport', e.target.value)} style={inputStyle}>
              <option value="cycling">{de ? 'Radfahren' : 'Cycling'}</option>
              <option value="running">{de ? 'Laufen' : 'Running'}</option>
            </select>
          </Field>
          <Field label={de ? 'Maximalpuls' : 'Max heart rate'} hint={hrHint(de, obsMaxHr, predicted)}>
            <NumInput value={form.maxHr} onChange={(v) => set('maxHr', v)} placeholder={String(predicted ?? 188)} suffix="bpm" />
          </Field>
          <Field label={de ? 'Ruhepuls' : 'Resting heart rate'} hint={obsRestHr ? (de ? `Aus Garmin: ${obsRestHr} bpm` : `From Garmin: ${obsRestHr} bpm`) : undefined}>
            <NumInput value={form.restHr} onChange={(v) => set('restHr', v)} placeholder="52" suffix="bpm" />
          </Field>
        </div>
      </Card>
      <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
        {de
          ? 'Maximalpuls vorbelegt nach Tanaka (208 − 0,7 × Alter) oder deinem höchsten gemessenen Wert. Korrigiere gern, wenn du deinen echten Wert kennst.'
          : 'Max HR is pre-filled via Tanaka (208 − 0.7 × age) or your highest recorded value. Override it if you know your true max.'}
      </p>
    </div>
  )
}

function hrHint(de: boolean, obs: number | null, predicted: number | null): string | undefined {
  if (obs) return de ? `Höchster gemessener Wert: ${obs} bpm` : `Highest recorded: ${obs} bpm`
  if (predicted) return de ? `Geschätzt (Tanaka): ${predicted} bpm` : `Estimated (Tanaka): ${predicted} bpm`
  return undefined
}

function ZonesStep({ de, form, set, estFtp, pZones, hZones }: {
  de: boolean; form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void
  estFtp: { watts: number; confidence: number } | null; pZones: Zone[] | null; hZones: Zone[] | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Field
          label="FTP"
          hint={estFtp
            ? (de ? `Aus deinen Fahrten geschätzt: ${estFtp.watts} W (bestes 20-Min × 0,95)` : `Estimated from your rides: ${estFtp.watts} W (best 20-min × 0.95)`)
            : (de ? 'Noch keine Daten — gib deinen FTP-Wert ein, wenn du ihn kennst.' : 'No data yet — enter your FTP if you know it.')}
        >
          <div className="flex items-center gap-2">
            <div style={{ maxWidth: 160 }}><NumInput value={form.ftp} onChange={(v) => set('ftp', v)} placeholder="240" suffix="W" /></div>
            {estFtp && (
              <button type="button" onClick={() => set('ftp', String(estFtp.watts))} className="text-[12px] underline" style={{ color: 'var(--color-forest-2)' }}>
                {de ? 'Schätzung übernehmen' : 'Use estimate'}
              </button>
            )}
          </div>
        </Field>
        {pZones && (
          <div className="mt-4">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.16em' }}>{de ? 'Leistungszonen (Coggan)' : 'Power zones (Coggan)'}</span>
            <ZoneTable zones={pZones} unit="W" />
          </div>
        )}
      </Card>

      {hZones && (
        <Card>
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.16em' }}>{de ? 'Herzfrequenzzonen (Karvonen)' : 'Heart-rate zones (Karvonen)'}</span>
          <ZoneTable zones={hZones} unit="bpm" />
        </Card>
      )}
      {!pZones && !hZones && (
        <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
          {de ? 'Gib FTP und/oder Maximalpuls ein, um deine Zonen zu sehen.' : 'Enter FTP and/or max HR to see your zones.'}
        </p>
      )}
    </div>
  )
}

function AvailabilityStep({ de, form, set }: { de: boolean; form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Field label={de ? `Tage pro Woche · ${form.daysPerWeek}` : `Days per week · ${form.daysPerWeek}`}>
          <input type="range" min={1} max={7} step={1} value={form.daysPerWeek} onChange={(e) => set('daysPerWeek', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-forest-2)' }} />
        </Field>
        <div className="mt-4">
          <Field label={de ? `Stunden pro Woche · ${form.weeklyHours}h` : `Hours per week · ${form.weeklyHours}h`}>
            <input type="range" min={2} max={25} step={1} value={form.weeklyHours} onChange={(e) => set('weeklyHours', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-forest-2)' }} />
          </Field>
        </div>
      </Card>
      <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
        {de ? 'Sei realistisch — der Plan baut auf dem auf, was du wirklich schaffst, nicht auf dem Idealfall.' : 'Be realistic — the plan builds on what you can actually do, not the ideal week.'}
      </p>
    </div>
  )
}

function GoalStep({ de, form, set }: { de: boolean; form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const types: Array<{ v: EventType; en: string; de: string }> = [
    { v: 'race', en: 'Race', de: 'Rennen' },
    { v: 'fondo', en: 'Gran Fondo', de: 'Gran Fondo' },
    { v: 'audax', en: 'Audax / Brevet', de: 'Audax / Brevet' },
    { v: 'maintenance', en: 'Just stay fit', de: 'Einfach fit bleiben' },
  ]
  const maintenance = form.eventType === 'maintenance'
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.16em' }}>{de ? 'Zieltyp' : 'Goal type'}</span>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {types.map((tp) => {
            const active = form.eventType === tp.v
            return (
              <button
                key={tp.v}
                type="button"
                onClick={() => set('eventType', tp.v)}
                className="rounded-[12px] px-3 py-3 text-[13px] text-left transition-colors"
                style={{
                  border: `1px solid ${active ? 'var(--color-forest-2)' : 'var(--color-rule)'}`,
                  backgroundColor: active ? 'color-mix(in srgb, var(--color-forest-2) 12%, transparent)' : 'var(--color-paper)',
                  color: 'var(--color-ink)', fontWeight: active ? 600 : 400,
                }}
              >
                {de ? tp.de : tp.en}
              </button>
            )
          })}
        </div>
      </Card>

      {form.eventType && !maintenance && (
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Field label={de ? 'Event-Name' : 'Event name'}>
              <input type="text" value={form.eventName} onChange={(e) => set('eventName', e.target.value)} style={inputStyle} placeholder={de ? 'z. B. Ötztaler' : 'e.g. Ötztaler'} />
            </Field>
            <Field label={de ? 'Datum' : 'Date'}>
              <input type="date" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={de ? 'Priorität' : 'Priority'} hint={de ? 'A = Hauptziel, B/C = Vorbereitung' : 'A = key target, B/C = build-up'}>
              <select value={form.eventPriority} onChange={(e) => set('eventPriority', e.target.value as Priority)} style={inputStyle}>
                <option value="">{de ? '— wählen —' : '— select —'}</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </Field>
          </div>
        </Card>
      )}
    </div>
  )
}

function IntensityStep({ de, form, set, split }: { de: boolean; form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; split: { hard: number; easy: number } }) {
  return (
    <div className="flex flex-col gap-3">
      {TRAINING_MODELS.map((m) => {
        const active = form.model === m.key
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => set('model', m.key as TrainingModel)}
            className="rounded-[14px] p-4 text-left transition-colors"
            style={{
              border: `1px solid ${active ? 'var(--color-forest-2)' : 'var(--color-rule)'}`,
              backgroundColor: active ? 'color-mix(in srgb, var(--color-forest-2) 10%, transparent)' : 'var(--color-paper-2)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium" style={{ color: 'var(--color-ink)' }}>{de ? m.nameDe : m.name}</span>
              {active && <Check size={16} strokeWidth={2.4} style={{ color: 'var(--color-forest-2)' }} />}
            </div>
            <p className="text-[12.5px] leading-snug mt-1" style={{ color: 'var(--color-muted)' }}>{de ? m.blurbDe : m.blurb}</p>
          </button>
        )
      })}
      <Card>
        <span className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>
          {de
            ? <>Bei {form.daysPerWeek} Tagen/Woche heißt das etwa <strong style={{ color: 'var(--color-ink)' }}>{split.hard} harte</strong> + <strong style={{ color: 'var(--color-ink)' }}>{split.easy} lockere</strong> Einheiten.</>
            : <>At {form.daysPerWeek} days/week that’s about <strong style={{ color: 'var(--color-ink)' }}>{split.hard} hard</strong> + <strong style={{ color: 'var(--color-ink)' }}>{split.easy} easy</strong> sessions.</>}
        </span>
      </Card>
    </div>
  )
}

function ReviewStep({ de, form, pZones, hZones, split }: { de: boolean; form: Form; pZones: Zone[] | null; hZones: Zone[] | null; split: { hard: number; easy: number } }) {
  const rows: Array<[string, string]> = [
    [de ? 'FTP' : 'FTP', form.ftp ? `${form.ftp} W` : '—'],
    [de ? 'Maximalpuls' : 'Max HR', form.maxHr ? `${form.maxHr} bpm` : '—'],
    [de ? 'Ruhepuls' : 'Resting HR', form.restHr ? `${form.restHr} bpm` : '—'],
    [de ? 'Gewicht' : 'Weight', form.weight ? `${form.weight} kg` : '—'],
    [de ? 'Verfügbarkeit' : 'Availability', `${form.daysPerWeek} ${de ? 'Tage' : 'days'} · ${form.weeklyHours}h`],
    [de ? 'Ziel' : 'Goal', goalLabel(de, form)],
    [de ? 'Modell' : 'Model', `${TRAINING_MODELS.find((m) => m.key === form.model)?.[de ? 'nameDe' : 'name']} · ${split.hard}+${split.easy}`],
  ]
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2 text-[13.5px]" style={{ borderBottom: '1px solid var(--color-rule)' }}>
              <span style={{ color: 'var(--color-muted)' }}>{k}</span>
              <span className="num-mono" style={{ color: 'var(--color-ink)' }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>
      {(pZones || hZones) && (
        <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
          {de ? `${pZones ? '7 Leistungszonen' : ''}${pZones && hZones ? ' + ' : ''}${hZones ? '5 HF-Zonen' : ''} berechnet und gespeichert.` : `${pZones ? '7 power zones' : ''}${pZones && hZones ? ' + ' : ''}${hZones ? '5 HR zones' : ''} computed and saved.`}
        </p>
      )}
    </div>
  )
}

function goalLabel(de: boolean, form: Form): string {
  if (!form.eventType) return de ? 'Noch nicht gesetzt' : 'Not set yet'
  if (form.eventType === 'maintenance') return de ? 'Fit bleiben' : 'Stay fit'
  const name = form.eventName || (de ? 'Event' : 'Event')
  return form.eventDate ? `${name} · ${form.eventDate}` : name
}

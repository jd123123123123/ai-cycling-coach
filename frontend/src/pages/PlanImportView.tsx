/**
 * PlanImportView — upload your OWN training plan (PDF / photo), let the
 * server extract it via Claude vision and adapt it deterministically to your
 * FTP, weekly hours, and age. Flow: dropzone → extraction progress →
 * adapted-plan preview (week × day rows with zone colors + watts/pace) →
 * honest caveat → pick start Monday → apply (writes PlannedWorkout rows).
 *
 * HONESTY: every number in the preview comes from the server (zones mapped by
 * rails, watts from YOUR FTP). Missing FTP/pace shows "—", never a guess.
 */
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, CalendarCheck2, CheckCircle2, FileUp, Loader2, Upload,
} from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { apiClient } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'

interface Adjustment {
  type: string
  age?: number
  max_hard_days?: number
  from_min?: number
  weekly_hours_available?: number
}

interface PlanDay {
  dow: number
  sport: string
  title: string
  duration_min: number | null
  intensity_raw: string
  structure: string | null
  zone: number
  is_rest: boolean
  zone_label: string
  zone_label_de: string
  target_watts_low: number | null
  target_watts_high: number | null
  target_pace: string | null
  adjustments: Adjustment[]
}

interface PlanWeek {
  week_number: number
  days: PlanDay[]
  planned_minutes: number
  scale_pct: number
}

interface AdaptedPlan {
  plan_name: string | null
  weeks: PlanWeek[]
  athlete: {
    ftp_watts: number | null
    weekly_hours_available: number | null
    age: number | null
    masters_rule_applied: boolean
  }
}

interface ExtractResponse {
  plan: AdaptedPlan
  source: { filename: string | null; media_type: string; plan_name: string | null }
}

const CARD = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 24 } as const
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'

const DOW_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DOW_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function zoneColor(zone: number): string {
  if (zone <= 0) return 'var(--color-muted)'
  return `var(--color-zone-${Math.min(zone, 6)})`
}

function fmtDuration(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nextMonday(): string {
  const d = new Date()
  const diff = (8 - d.getDay()) % 7 || 7 // strictly the NEXT Monday
  d.setDate(d.getDate() + diff)
  return localDateStr(d)
}

function isMonday(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return false
  return new Date(y, m - 1, d).getDay() === 1
}

function adjustmentText(a: Adjustment, de: boolean): string {
  if (a.type === 'masters_hard_day_eased') {
    return de
      ? `Auf Grundlage entschärft — max. ${a.max_hard_days ?? 2} harte Tage/Woche mit ${a.age}`
      : `Eased to endurance — max ${a.max_hard_days ?? 2} hard days/week at age ${a.age}`
  }
  if (a.type === 'squeezed_to_availability') {
    return de
      ? `Von ${a.from_min} min gekürzt — passt in deine ${a.weekly_hours_available} h/Woche`
      : `Shortened from ${a.from_min} min to fit your ${a.weekly_hours_available} h/week`
  }
  return ''
}

type Phase = 'idle' | 'extracting' | 'preview' | 'applying' | 'applied'

export default function PlanImportView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExtractResponse | null>(null)
  const [startMonday, setStartMonday] = useState<string>(nextMonday())
  const [applied, setApplied] = useState<{ created: number; replaced: number } | null>(null)

  const plan = result?.plan ?? null
  const dowNames = de ? DOW_DE : DOW_EN

  const totalSessions = useMemo(
    () => plan?.weeks.reduce((n, w) => n + w.days.filter((d) => !d.is_rest).length, 0) ?? 0,
    [plan],
  )

  async function handleFile(file: File) {
    setError(null)
    const type = (file.type || '').toLowerCase()
    const okType = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'].includes(type)
    if (!okType) {
      setError(de ? 'Nur PDF, PNG oder JPG.' : 'Only PDF, PNG, or JPG files.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(de ? 'Datei zu groß — max. 10 MB.' : 'File too large — 10 MB max.')
      return
    }
    setPhase('extracting')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await apiClient.post<ExtractResponse>('/plan-import/extract', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
      setPhase('preview')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || (de ? 'Import fehlgeschlagen — bitte erneut versuchen.' : 'Import failed — please try again.'))
      setPhase('idle')
    }
  }

  async function handleApply() {
    if (!plan) return
    if (!isMonday(startMonday)) {
      setError(de ? 'Das Startdatum muss ein Montag sein.' : 'The start date must be a Monday.')
      return
    }
    setError(null)
    setPhase('applying')
    try {
      const res = await apiClient.post<{ created: number; replaced: number }>('/plan-import/apply', {
        plan,
        start_monday: startMonday,
      })
      setApplied({ created: res.data.created, replaced: res.data.replaced })
      setPhase('applied')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || (de ? 'Übernehmen fehlgeschlagen.' : 'Could not apply the plan.'))
      setPhase('preview')
    }
  }

  return (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={de ? 'Zurück' : 'Back'}
            className="grid place-items-center rounded-full"
            style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
          >
            <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
          </button>
          <div className="flex flex-col">
            <h1 className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)' }}>
              {de ? 'Plan importieren' : 'Import your plan'}
            </h1>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {de
                ? 'PDF oder Foto hochladen — wir passen ihn an dein FTP, deine Zeit und dein Alter an'
                : 'Upload a PDF or photo — we adapt it to your FTP, time, and age'}
            </span>
          </div>
        </div>

        {/* ── Upload dropzone ── */}
        {(phase === 'idle' || phase === 'extracting') && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => phase === 'idle' && inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' && phase === 'idle') inputRef.current?.click() }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f && phase === 'idle') void handleFile(f)
            }}
            className="flex flex-col items-center gap-3 p-8 text-center"
            style={{
              borderRadius: 24,
              background: dragOver ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-paper-2))' : 'var(--color-paper-2)',
              border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-rule)'}`,
              cursor: phase === 'idle' ? 'pointer' : 'default',
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ''
              }}
            />
            {phase === 'extracting' ? (
              <>
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                  {de ? 'Plan wird gelesen…' : 'Reading your plan…'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {de
                    ? 'Extrahieren und auf deine Zonen abbilden — das dauert bis zu einer Minute'
                    : 'Extracting and mapping to your zones — this can take up to a minute'}
                </span>
              </>
            ) : (
              <>
                <div className="grid place-items-center rounded-full" style={{ width: 56, height: 56, background: 'var(--color-accent-soft)' }}>
                  <Upload size={24} style={{ color: 'var(--color-accent)' }} />
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-ink)' }}>
                  {de ? 'Plan hier ablegen oder tippen' : 'Drop your plan here or tap to choose'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {de ? 'PDF, PNG oder JPG · max. 10 MB' : 'PDF, PNG, or JPG · 10 MB max'}
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2.5 p-4" style={{ borderRadius: 16, background: 'color-mix(in srgb, var(--color-strain) 10%, var(--color-paper-2))', border: '1px solid var(--color-rule)' }}>
            <AlertTriangle size={16} style={{ color: 'var(--color-amber)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{error}</span>
          </div>
        )}

        {/* ── Preview ── */}
        {plan && (phase === 'preview' || phase === 'applying' || phase === 'applied') && (
          <>
            {/* Adaptation summary */}
            <div className="flex flex-col gap-3 p-5" style={CARD}>
              <div className="flex items-center gap-2">
                <FileUp size={16} style={{ color: 'var(--color-accent)' }} />
                <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                  {de ? 'DEIN PLAN · ANGEPASST' : 'YOUR PLAN · ADAPTED'}
                </span>
              </div>
              {(plan.plan_name || result?.source.filename) && (
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
                  {plan.plan_name || result?.source.filename}
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full px-3 py-1 num-mono" style={{ fontSize: 11.5, fontWeight: 700, background: 'var(--color-surface-2)', color: 'var(--color-ink-2)' }}>
                  {plan.weeks.length} {de ? 'Wochen' : plan.weeks.length === 1 ? 'week' : 'weeks'} · {totalSessions} {de ? 'Einheiten' : 'sessions'}
                </span>
                <span className="rounded-full px-3 py-1 num-mono" style={{ fontSize: 11.5, fontWeight: 700, background: 'var(--color-surface-2)', color: plan.athlete.ftp_watts ? 'var(--color-recovery)' : 'var(--color-muted)' }}>
                  {plan.athlete.ftp_watts ? `FTP ${plan.athlete.ftp_watts} W` : de ? 'kein FTP — Watt weggelassen' : 'no FTP — watts omitted'}
                </span>
                {plan.athlete.weekly_hours_available != null && (
                  <span className="rounded-full px-3 py-1 num-mono" style={{ fontSize: 11.5, fontWeight: 700, background: 'var(--color-surface-2)', color: 'var(--color-ink-2)' }}>
                    {plan.athlete.weekly_hours_available} {de ? 'h/Woche' : 'h/week'}
                  </span>
                )}
                {plan.athlete.masters_rule_applied && (
                  <span className="rounded-full px-3 py-1" style={{ fontSize: 11.5, fontWeight: 700, background: 'var(--color-amber-soft)', color: 'var(--color-amber)' }}>
                    {de ? 'max. 2 harte Tage/Woche (50+)' : 'max 2 hard days/week (50+)'}
                  </span>
                )}
              </div>
              {/* Honest caveat */}
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} style={{ color: 'var(--color-amber)', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.45 }}>
                  {de
                    ? 'Aus deiner Datei extrahiert — bitte prüfen, bevor du übernimmst. KI-Lesen kann Details falsch erfassen.'
                    : 'Extracted from your file — check before applying. AI reading can get details wrong.'}
                </span>
              </div>
            </div>

            {/* Week cards */}
            {plan.weeks.map((week) => (
              <div key={week.week_number} className="flex flex-col gap-3 p-5" style={CARD}>
                <div className="flex items-center justify-between">
                  <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                    {de ? `WOCHE ${week.week_number}` : `WEEK ${week.week_number}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {week.scale_pct < 100 && (
                      <span className="rounded-full px-2 py-0.5" style={{ fontSize: 10, fontWeight: 700, background: 'var(--color-amber-soft)', color: 'var(--color-amber)' }}>
                        {de ? `auf ${week.scale_pct}% gekürzt` : `scaled to ${week.scale_pct}%`}
                      </span>
                    )}
                    <span className="num-mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-muted)' }}>
                      {fmtDuration(week.planned_minutes)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col">
                  {week.days.map((day) => (
                    <div key={day.dow} className="flex flex-col gap-1 py-2.5" style={{ borderTop: '1px solid var(--color-rule)' }}>
                      <div className="flex items-center gap-3">
                        <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted)', width: 30, flexShrink: 0 }}>
                          {dowNames[day.dow]}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 flex items-center gap-1.5"
                          style={{
                            fontSize: 10.5, fontWeight: 700, flexShrink: 0,
                            background: `color-mix(in srgb, ${zoneColor(day.zone)} 16%, var(--color-paper-2))`,
                            color: day.is_rest ? 'var(--color-muted)' : zoneColor(day.zone),
                          }}
                        >
                          <span className="rounded-full" style={{ width: 6, height: 6, background: zoneColor(day.zone) }} />
                          {de ? day.zone_label_de : day.zone_label}
                        </span>
                        <span
                          className="flex-1 truncate"
                          style={{ fontSize: 13, fontWeight: 600, color: day.is_rest ? 'var(--color-muted)' : 'var(--color-ink)' }}
                        >
                          {day.title}
                        </span>
                        <span className="num-mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-2)', flexShrink: 0 }}>
                          {day.is_rest ? '' : fmtDuration(day.duration_min)}
                        </span>
                      </div>
                      {(day.target_watts_low != null || day.target_pace) && (
                        <span className="num-mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-2)', paddingLeft: 42 }}>
                          {day.target_watts_low != null
                            ? `${day.target_watts_low}–${day.target_watts_high} W`
                            : day.target_pace}
                        </span>
                      )}
                      {day.structure && (
                        <span className="truncate" style={{ fontSize: 11, color: 'var(--color-muted)', paddingLeft: 42 }}>
                          {day.structure}
                        </span>
                      )}
                      {day.adjustments.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--color-amber)', paddingLeft: 42, lineHeight: 1.4 }}>
                          {day.adjustments.map((a) => adjustmentText(a, de)).filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Apply */}
            {phase !== 'applied' ? (
              <div className="flex flex-col gap-3.5 p-5" style={{ ...CARD, borderColor: 'var(--color-accent)' }}>
                <div className="flex items-center gap-2">
                  <CalendarCheck2 size={16} style={{ color: 'var(--color-accent)' }} />
                  <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                    {de ? 'IN DEN KALENDER' : 'ADD TO CALENDAR'}
                  </span>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    {de ? 'Woche 1 startet am Montag' : 'Week 1 starts on Monday'}
                  </span>
                  <input
                    type="date"
                    value={startMonday}
                    onChange={(e) => setStartMonday(e.target.value)}
                    style={{
                      background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)',
                      color: 'var(--color-ink)', borderRadius: 12, padding: '10px 12px',
                      fontSize: 14, colorScheme: 'dark',
                    }}
                  />
                  {!isMonday(startMonday) && (
                    <span style={{ fontSize: 11, color: 'var(--color-amber)' }}>
                      {de ? 'Bitte einen Montag wählen.' : 'Please pick a Monday.'}
                    </span>
                  )}
                </label>
                <span style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.45 }}>
                  {de
                    ? 'Ersetzt nur zukünftige geplante Einheiten an den betroffenen Tagen — Vergangenes bleibt unberührt.'
                    : 'Replaces only future planned sessions on the covered days — past days are never touched.'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleApply()}
                  disabled={phase === 'applying' || !isMonday(startMonday)}
                  className="flex items-center justify-center gap-2 rounded-full py-3"
                  style={{
                    fontSize: 14, fontWeight: 800,
                    background: 'var(--color-accent)', color: '#0A0C0F',
                    opacity: phase === 'applying' || !isMonday(startMonday) ? 0.55 : 1,
                  }}
                >
                  {phase === 'applying' && <Loader2 size={16} className="animate-spin" />}
                  {phase === 'applying'
                    ? de ? 'Wird übernommen…' : 'Applying…'
                    : de ? 'Plan übernehmen' : 'Apply plan'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-6 text-center" style={{ borderRadius: 24, background: 'color-mix(in srgb, var(--color-recovery) 10%, var(--color-paper-2))', border: '1px solid var(--color-recovery)' }}>
                <CheckCircle2 size={28} style={{ color: 'var(--color-recovery)' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
                  {de
                    ? `${applied?.created ?? 0} Einheiten geplant`
                    : `${applied?.created ?? 0} sessions added to your calendar`}
                </span>
                {applied != null && applied.replaced > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {de ? `${applied.replaced} bestehende Einheiten ersetzt` : `${applied.replaced} existing sessions replaced`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/calendar')}
                  className="rounded-full px-5 py-2.5"
                  style={{ fontSize: 13, fontWeight: 800, background: 'var(--color-recovery)', color: '#0A0C0F' }}
                >
                  {de ? 'Zum Kalender' : 'View calendar'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  )
}

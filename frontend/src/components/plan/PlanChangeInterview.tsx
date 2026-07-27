/**
 * PlanChangeInterview — the "Plan & Ziel ändern" bottom sheet (plan-engine v2).
 *
 * A clean two-path chooser replaces the old conversational interview:
 *
 *   • CHOOSE  — two cards: "Neuer Plan" | "Präferenzen anpassen".
 *   • GOAL    — re-ask the target event (name + date + type) + weekly hours,
 *               then regenerate the plan from current fitness (new_event).
 *   • PREFS   — a DIRECT form (no interview): weekly-hours stepper, Mon–Sun
 *               day toggles, long-ride-day picker → regenerate around them.
 *   • RESULT  — the regenerated week + the honest "nichts geht verloren" copy
 *               (CTL anchor, preserved sessions, hours reconciliation).
 *
 * No-guilt register throughout (SDT autonomy support): completed work counts
 * forward — the rebuild anchors to live CTL on the server, nothing is slashed.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, ChevronRight, ChevronLeft, Check, Sparkles, Bike, Moon, ShieldCheck,
  Anchor, Loader2, Clock, Minus, Plus, SlidersHorizontal, Flag, CalendarDays,
} from 'lucide-react'
import { springs } from '../../utils/motion'
import { useLocale } from '../../contexts/LocaleContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { updateGoals } from '../../api/athletes'
import { WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { PLAN_ADAPTATIONS_KEY } from '../../hooks/usePlanAdaptations'
import {
  applyPlanChange,
  type InterviewAnswers, type PlanChangeApplyResponse, type DaysAvailable,
} from '../../api/plan'

const ACCENT = 'var(--color-accent)'

const OPTION_LABELS: Record<string, { de: string; en: string }> = {
  race: { de: 'Rennen', en: 'Race' },
  fondo: { de: 'Gran Fondo', en: 'Fondo' },
  audax: { de: 'Audax / Langstrecke', en: 'Audax' },
}
const optLabel = (key: string, de: boolean) => (OPTION_LABELS[key] ? (de ? OPTION_LABELS[key].de : OPTION_LABELS[key].en) : key)

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type Weekday = typeof WEEKDAYS[number]
const DAY_SHORT: Record<string, { de: string; en: string }> = {
  mon: { de: 'Mo', en: 'Mon' }, tue: { de: 'Di', en: 'Tue' }, wed: { de: 'Mi', en: 'Wed' },
  thu: { de: 'Do', en: 'Thu' }, fri: { de: 'Fr', en: 'Fri' }, sat: { de: 'Sa', en: 'Sat' }, sun: { de: 'So', en: 'Sun' },
}

const SPORT_ICON: Record<string, typeof Bike> = { cycling: Bike, rest: Moon }

// "base1" → DE "Grundlage 1" / EN "Base 1" (mirrors PlanTab's phase words).
const PHASE_WORDS: Record<string, { en: string; de: string }> = {
  base: { en: 'Base', de: 'Grundlage' },
  build: { en: 'Build', de: 'Aufbau' },
  peak: { en: 'Peak', de: 'Peak' },
  taper: { en: 'Taper', de: 'Taper' },
  race: { en: 'Race', de: 'Rennen' },
}
function phaseLabel(raw: string, de: boolean): string {
  const m = raw.match(/^([a-z]+)\s*(\d+)?$/i)
  const stem = (m?.[1] ?? raw).toLowerCase()
  const word = Object.entries(PHASE_WORDS).find(([k]) => stem.startsWith(k))?.[1]
  const label = word ? (de ? word.de : word.en) : raw.replace(/^\w/, (c) => c.toUpperCase())
  return m?.[2] ? `${label} ${m[2]}` : label
}

// ── Shared chrome ───────────────────────────────────────────────────────────

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className="rounded-full"
      style={{
        padding: '10px 16px', minHeight: 44, fontSize: 13, fontWeight: active ? 700 : 600,
        background: active ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
        border: `1px solid ${active ? ACCENT : 'var(--color-rule)'}`,
        color: active ? ACCENT : 'var(--color-ink-2)', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

type Mode = 'choose' | 'goal' | 'prefs'

// ── Main sheet ──────────────────────────────────────────────────────────────

export default function PlanChangeInterview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const qc = useQueryClient()
  const titleId = useRef(`plan-change-${Math.random().toString(36).slice(2)}`)
  const { data: profile } = useAthleteProfile()

  const [mode, setMode] = useState<Mode>('choose')
  const [result, setResult] = useState<PlanChangeApplyResponse | null>(null)

  // ── Präferenzen form state ──
  const [hours, setHours] = useState<number>(8)
  const [days, setDays] = useState<Set<Weekday>>(new Set(WEEKDAYS))
  const [longDay, setLongDay] = useState<Weekday | ''>('')

  // ── Neuer-Plan (goal) form state ──
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventType, setEventType] = useState<'race' | 'fondo' | 'audax' | ''>('')
  const [goalHours, setGoalHours] = useState<number>(8)

  // Reset the flow only on a fresh open (closed → open), never on the profile
  // refetch that a successful apply triggers — otherwise the result view would
  // be wiped the instant the plan changes.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) { setMode('choose'); setResult(null) }
    wasOpen.current = open
  }, [open])

  // Seed the forms from the live profile — only while still on the chooser with
  // no result, so a mid-flow profile update can never clobber the user's edits.
  useEffect(() => {
    if (!open || !profile || mode !== 'choose' || result) return
    const h = profile.weekly_hours_available ?? 8
    setHours(h); setGoalHours(h)
    const da = profile.days_available
    if (da) {
      setDays(new Set(WEEKDAYS.filter((d) => da[d] !== false)))
      setLongDay((da.long_day as Weekday) ?? '')
    } else {
      setDays(new Set(WEEKDAYS)); setLongDay('')
    }
    const goals = (profile.goals ?? {}) as { target_event_name?: string; target_event?: { name?: string } }
    setEventName(goals.target_event_name ?? goals.target_event?.name ?? '')
    setEventDate(profile.target_event_date ?? '')
    setEventType((['race', 'fondo', 'audax'].includes(profile.target_event_type ?? '') ? profile.target_event_type : '') as typeof eventType)
  }, [open, profile, mode, result])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  const onApplied = (res: PlanChangeApplyResponse) => {
    setResult(res)
    void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
    void qc.invalidateQueries({ queryKey: PLAN_ADAPTATIONS_KEY })
    void qc.invalidateQueries({ queryKey: ['coach'] })
    void qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
  }

  // ── Präferenzen apply: hours + days + long-day → regenerate ──
  const applyPrefs = useMutation({
    mutationFn: () => {
      const da = Object.fromEntries(WEEKDAYS.map((d) => [d, days.has(d)])) as unknown as DaysAvailable
      if (longDay && days.has(longDay)) da.long_day = longDay
      const answers: InterviewAnswers = { weekly_hours: hours, days_available: da }
      return applyPlanChange(answers)
    },
    onSuccess: onApplied,
  })

  // ── Neuer Plan apply: persist event name, then regenerate around the goal ──
  const applyGoal = useMutation({
    mutationFn: async () => {
      const name = eventName.trim()
      if (name || eventDate) {
        try {
          await updateGoals({
            ...(profile?.goals ?? {}),
            ...(name ? { target_event_name: name } : {}),
            ...(eventDate ? { target_event_date: eventDate } : {}),
          })
        } catch {
          // Name is a label — a failed goals write must not block the rebuild.
        }
      }
      const answers: InterviewAnswers = {
        goal_changed: 'new_event',
        weekly_hours: goalHours,
        ...(eventDate ? { target_event_date: eventDate } : {}),
        ...(eventType ? { target_event_type: eventType } : {}),
      }
      return applyPlanChange(answers)
    },
    onSuccess: onApplied,
  })

  const pending = applyPrefs.isPending || applyGoal.isPending
  const applyError = applyPrefs.error ?? applyGoal.error
  const daysCount = days.size
  const goalReady = eventDate !== '' && daysCount > 0

  const back = () => { setMode('choose') }

  // ── Hours stepper ──
  const Stepper = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex items-center justify-between rounded-2xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', padding: '10px 14px' }}>
      <button
        type="button" aria-label={de ? 'Weniger' : 'Less'}
        onClick={() => onChange(Math.max(1, Math.round((value - 0.5) * 2) / 2))}
        className="flex items-center justify-center rounded-full shrink-0"
        style={{ width: 40, height: 40, background: 'var(--color-surface-3)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }}
      >
        <Minus size={18} />
      </button>
      <div className="flex flex-col items-center" style={{ gap: 1 }}>
        <span className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)' }}>
          {value.toFixed(1).replace('.', de ? ',' : '.')}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Std. / Woche' : 'hrs / week'}</span>
      </div>
      <button
        type="button" aria-label={de ? 'Mehr' : 'More'}
        onClick={() => onChange(Math.min(40, Math.round((value + 0.5) * 2) / 2))}
        className="flex items-center justify-center rounded-full shrink-0"
        style={{ width: 40, height: 40, background: 'var(--color-surface-3)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }}
      >
        <Plus size={18} />
      </button>
    </div>
  )

  const DayToggles = () => (
    <div className="flex" style={{ gap: 6 }}>
      {WEEKDAYS.map((d) => {
        const on = days.has(d)
        return (
          <button key={d} type="button"
            onClick={() => setDays((s) => {
              const n = new Set(s)
              if (n.has(d)) { n.delete(d); if (longDay === d) setLongDay('') } else n.add(d)
              return n.size === 0 ? s : n
            })}
            className="flex-1 rounded-2xl"
            style={{ padding: '12px 0', minHeight: 46, fontSize: 12, fontWeight: 700, background: on ? 'var(--color-accent-soft)' : 'var(--color-surface-2)', border: `1px solid ${on ? ACCENT : 'var(--color-rule)'}`, color: on ? ACCENT : 'var(--color-muted)' }}>
            {DAY_SHORT[d][de ? 'de' : 'en']}
          </button>
        )
      })}
    </div>
  )

  // ── Result view (regenerated week + honest credit copy) ──
  const renderResult = (res: PlanChangeApplyResponse) => (
    <>
      <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 12 }}>
        <span className="inline-flex items-center" style={{ gap: 8 }}>
          <Sparkles size={18} style={{ color: ACCENT }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
            {de ? 'Dein neuer Plan steht' : 'Your new plan is ready'}
          </span>
          {res.phase && (
            <span className="ml-auto inline-flex items-center rounded-full px-3 py-1" style={{ background: 'var(--color-accent-soft)', color: ACCENT, fontSize: 11.5, fontWeight: 700 }}>
              {phaseLabel(res.phase, de)}
            </span>
          )}
        </span>
        <div className="flex flex-col" style={{ gap: 8 }}>
          {res.ctl_anchor != null && (
            <span className="inline-flex items-start" style={{ gap: 9 }}>
              <Anchor size={14} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                {de
                  ? `Verankert an deiner aktuellen Fitness (CTL ${Math.round(res.ctl_anchor)}) — jede absolvierte Einheit zählt weiter.`
                  : `Anchored to your current fitness (CTL ${Math.round(res.ctl_anchor)}) — every completed session still counts.`}
              </span>
            </span>
          )}
          {(res.preserved_sessions ?? 0) > 0 && (
            <span className="inline-flex items-start" style={{ gap: 9 }}>
              <ShieldCheck size={14} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                {de
                  ? `${res.preserved_sessions} eigene ${res.preserved_sessions === 1 ? 'Einheit bleibt' : 'Einheiten bleiben'} unangetastet.`
                  : `${res.preserved_sessions} of your own ${res.preserved_sessions === 1 ? 'session stays' : 'sessions stay'} untouched.`}
              </span>
            </span>
          )}
          {res.hours_note != null && (
            <span className="inline-flex items-start" style={{ gap: 9 }}>
              <Clock size={14} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                {de ? res.hours_note.de : res.hours_note.en}
              </span>
            </span>
          )}
          {res.hours_note == null && res.planned_hours != null && (
            <span className="inline-flex items-start" style={{ gap: 9 }}>
              <Clock size={14} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                {de
                  ? `Geplant: ~${res.planned_hours.toFixed(1).replace('.', ',')} h diese Woche.`
                  : `Planned: ~${res.planned_hours.toFixed(1)} h this week.`}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 10 }}>
        <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>
          {de ? 'DEINE NEUE WOCHE' : 'YOUR NEW WEEK'}
        </span>
        {res.week.map((d) => {
          const isRest = d.template_id === 'rest_day' || d.sport === 'rest'
          const Icon = isRest ? Moon : (SPORT_ICON[d.sport] ?? Bike)
          const col = isRest ? 'var(--color-recovery)' : 'var(--color-strain)'
          const day = new Date(`${d.date}T12:00:00`)
          return (
            <div key={`${d.date}-${d.title}`} className="flex items-center" style={{ gap: 11 }}>
              <span className="num-mono shrink-0" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', width: 30 }}>
                {new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', { weekday: 'short' }).format(day)}
              </span>
              <Icon size={15} style={{ color: col, flexShrink: 0 }} />
              <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, fontWeight: isRest ? 500 : 600, color: isRest ? 'var(--color-muted)' : 'var(--color-ink)' }}>
                {isRest ? (de ? 'Ruhetag' : 'Rest day') : (de && d.title_de ? d.title_de : d.title)}
              </span>
            </div>
          )
        })}
        {res.week.length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
            {de ? 'Die Woche wird gerade aufgebaut — schau gleich im Plan nach.' : 'The week is being built — check the plan in a moment.'}
          </p>
        )}
      </div>
    </>
  )

  const headerTitle = result
    ? (de ? 'Neuer Plan' : 'New plan')
    : mode === 'prefs'
      ? (de ? 'Präferenzen anpassen' : 'Adjust preferences')
      : mode === 'goal'
        ? (de ? 'Neuer Plan' : 'New plan')
        : (de ? 'Plan & Ziel ändern' : 'Change plan & goal')

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="pci-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }} onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 500 }}
          />
          <motion.div
            key="pci-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId.current}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={reduce ? { duration: 0.15 } : springs.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', bottom: 0,
              zIndex: 501, width: '100%', maxWidth: 480, height: '92vh', maxHeight: '92vh',
              display: 'flex', flexDirection: 'column',
              background: 'var(--color-paper)', borderTop: '1px solid var(--color-rule)',
              borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
            }}
          >
            <div className="flex justify-center" style={{ paddingTop: 10 }}>
              <div style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--color-surface-3)' }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between" style={{ padding: '10px 20px 12px', gap: 12 }}>
              <div className="flex items-center min-w-0" style={{ gap: 8 }}>
                {mode !== 'choose' && !result && (
                  <button
                    type="button" aria-label={de ? 'Zurück' : 'Back'} onClick={back}
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--color-rule)', background: 'transparent', color: 'var(--color-muted)' }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                )}
                <span id={titleId.current} className="truncate" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                  {headerTitle}
                </span>
              </div>
              <button
                type="button" aria-label={de ? 'Schließen' : 'Close'} onClick={onClose}
                className="flex items-center justify-center shrink-0"
                style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid var(--color-rule)', background: 'transparent', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* ── Result (shown after a successful regenerate, either path) ── */}
              {result && renderResult(result)}

              {/* ── CHOOSE ── */}
              {!result && mode === 'choose' && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                    {de
                      ? 'Was möchtest du ändern? Alles, was du trainiert hast, zählt weiter — der neue Plan baut darauf auf.'
                      : 'What do you want to change? Everything you trained still counts — the new plan builds on it.'}
                  </p>

                  <button type="button" onClick={() => setMode('goal')}
                    className="hover-card flex items-center text-left rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 14 }}>
                    <span className="grid place-items-center rounded-full shrink-0" style={{ width: 48, height: 48, background: 'var(--color-accent-soft)' }}>
                      <Flag size={22} style={{ color: ACCENT }} />
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col" style={{ gap: 3 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Neuer Plan' : 'New plan'}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                        {de ? 'Neues Ziel-Event setzen und den Plan von Grund auf neu aufbauen.' : 'Set a new target event and rebuild the plan from scratch.'}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0" style={{ color: ACCENT }} />
                  </button>

                  <button type="button" onClick={() => setMode('prefs')}
                    className="hover-card flex items-center text-left rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 14 }}>
                    <span className="grid place-items-center rounded-full shrink-0" style={{ width: 48, height: 48, background: 'var(--color-accent-soft)' }}>
                      <SlidersHorizontal size={22} style={{ color: ACCENT }} />
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col" style={{ gap: 3 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Präferenzen anpassen' : 'Adjust preferences'}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                        {de ? 'Wochenstunden, Trainingstage und deinen langen Tag ändern.' : 'Change weekly hours, training days and your long day.'}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0" style={{ color: ACCENT }} />
                  </button>
                </>
              )}

              {/* ── PREFS ── */}
              {!result && mode === 'prefs' && (
                <>
                  <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Wochenumfang' : 'Weekly volume'}</span>
                    <Stepper value={hours} onChange={setHours} />
                  </div>

                  <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Trainingstage' : 'Training days'}</span>
                    <DayToggles />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Langer Tag' : 'Long day'}</span>
                    <div className="flex flex-wrap" style={{ gap: 6 }}>
                      {[...days].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)).map((d) => (
                        <Pill key={d} active={longDay === d} onClick={() => setLongDay(longDay === d ? '' : d)}>
                          {DAY_SHORT[d][de ? 'de' : 'en']}
                        </Pill>
                      ))}
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.45 }}>
                    {de
                      ? 'Harte und lange Einheiten landen auf deinen freien Tagen — der lange Tag bekommt die Ausfahrt.'
                      : 'Hard and long sessions land on your free days — the long day gets the ride.'}
                  </p>
                </>
              )}

              {/* ── GOAL ── */}
              {!result && mode === 'goal' && (
                <>
                  <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 12 }}>
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <Flag size={16} style={{ color: ACCENT }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Dein Ziel-Event' : 'Your target event'}</span>
                    </span>
                    <input
                      type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
                      placeholder={de ? 'Name (z. B. Ötztaler Radmarathon)' : 'Name (e.g. Ötztaler Radmarathon)'}
                      className="rounded-2xl"
                      style={{ padding: '12px 14px', fontSize: 15, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', outline: 'none', width: '100%' }}
                    />
                    <span className="inline-flex items-center" style={{ gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
                      <CalendarDays size={13} /> {de ? 'Datum' : 'Date'}
                    </span>
                    <input
                      type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="rounded-2xl"
                      style={{ padding: '12px 14px', fontSize: 15, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', outline: 'none', width: '100%', colorScheme: 'dark' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Event-Typ' : 'Event type'}</span>
                    <div className="flex flex-wrap" style={{ gap: 8 }}>
                      {(['race', 'fondo', 'audax'] as const).map((t) => (
                        <Pill key={t} active={eventType === t} onClick={() => setEventType(eventType === t ? '' : t)}>
                          {optLabel(t, de)}
                        </Pill>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Wochenumfang' : 'Weekly volume'}</span>
                    <Stepper value={goalHours} onChange={setGoalHours} />
                  </div>
                </>
              )}

              {applyError != null && (
                <p style={{ fontSize: 12.5, color: 'var(--color-alert)', lineHeight: 1.4 }}>
                  {(() => {
                    const detail = (applyError as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                    return detail ?? (de ? 'Das hat nicht geklappt — bitte noch einmal versuchen.' : 'That didn’t work — please try again.')
                  })()}
                </p>
              )}
            </div>

            {/* Footer CTA */}
            <div style={{ padding: '12px 20px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', borderTop: '1px solid var(--color-rule)' }}>
              {result && (
                <button type="button" onClick={onClose}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full"
                  style={{ minHeight: 50, background: ACCENT, color: '#FFFFFF', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                  <Check size={18} strokeWidth={2.6} /> {de ? 'Zum neuen Plan' : 'See the new plan'}
                </button>
              )}
              {!result && mode === 'prefs' && (
                <button type="button" disabled={pending || daysCount === 0} onClick={() => applyPrefs.mutate()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full"
                  style={{ minHeight: 50, background: ACCENT, color: '#FFFFFF', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: pending || daysCount === 0 ? 0.6 : 1 }}>
                  {pending
                    ? (<><Loader2 size={17} className="animate-spin" /> {de ? 'Plan wird neu aufgebaut …' : 'Rebuilding your plan …'}</>)
                    : (<>{de ? 'Anwenden' : 'Apply'} <Sparkles size={17} /></>)}
                </button>
              )}
              {!result && mode === 'goal' && (
                <button type="button" disabled={pending || !goalReady} onClick={() => applyGoal.mutate()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full"
                  style={{ minHeight: 50, background: ACCENT, color: '#FFFFFF', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: pending || !goalReady ? 0.6 : 1 }}>
                  {pending
                    ? (<><Loader2 size={17} className="animate-spin" /> {de ? 'Plan wird aufgebaut …' : 'Building your plan …'}</>)
                    : (<>{de ? 'Plan erstellen' : 'Build plan'} <Sparkles size={17} /></>)}
                </button>
              )}
              {!result && mode === 'choose' && (
                <button type="button" onClick={onClose}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full"
                  style={{ minHeight: 50, background: 'var(--color-surface-2)', color: 'var(--color-ink-2)', fontSize: 15, fontWeight: 700, border: '1px solid var(--color-rule)', cursor: 'pointer' }}>
                  {de ? 'Abbrechen' : 'Cancel'}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(sheet, document.body)
}

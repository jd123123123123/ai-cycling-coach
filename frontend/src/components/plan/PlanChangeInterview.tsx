/**
 * PlanChangeInterview — the 3-step plan-change flow (plan-engine v2):
 *
 *   1 · Credit — what was done under the current plan (GET /plan/change/interview
 *       `current`): sessions, compliance, CTL delta. Credited, never scolded.
 *   2 · Delta questions — rendered from the server's delta-driven question list
 *       (only what the profile can't already answer).
 *   3 · New week — POST /plan/change/apply; shows the regenerated week, the
 *       CTL anchor and the preserved athlete-owned sessions.
 *
 * No-guilt register throughout (SDT autonomy support): completed work counts
 * forward, "too hard" never slashes anything client-side — the rebuild anchors
 * to live CTL on the server.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, ChevronRight, Check, Medal, TrendingUp, CalendarCheck2, Sparkles,
  Bike, Footprints, Dumbbell, Moon, ShieldCheck, Anchor, Loader2, Clock,
} from 'lucide-react'
import { springs } from '../../utils/motion'
import { useLocale } from '../../contexts/LocaleContext'
import { WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { PLAN_ADAPTATIONS_KEY } from '../../hooks/usePlanAdaptations'
import {
  fetchPlanChangeInterview, applyPlanChange,
  type InterviewAnswers, type InterviewQuestion, type PlanChangeApplyResponse,
} from '../../api/plan'

const ACCENT = 'var(--color-accent)'

// ── Localized labels for machine option keys ────────────────────────────────

const OPTION_LABELS: Record<string, { de: string; en: string }> = {
  too_hard: { de: 'Zu hart', en: 'Too hard' },
  too_boring: { de: 'Zu eintönig', en: 'Too boring' },
  too_rigid: { de: 'Zu starr', en: 'Too rigid' },
  life_changed: { de: 'Mein Alltag hat sich geändert', en: 'Life changed' },
  same: { de: 'Ja, bleibt', en: 'Still on' },
  new_event: { de: 'Neues Event', en: 'New event' },
  no_event: { de: 'Kein Event mehr', en: 'No event' },
  race: { de: 'Rennen', en: 'Race' },
  fondo: { de: 'Gran Fondo', en: 'Fondo' },
  audax: { de: 'Audax / Langstrecke', en: 'Audax' },
  maintenance: { de: 'Fit bleiben', en: 'Stay fit' },
  new: { de: 'Neu dabei', en: 'New' },
  returning: { de: 'Wiedereinstieg', en: 'Returning' },
  seasoned: { de: 'Erfahren', en: 'Seasoned' },
}
const optLabel = (key: string, de: boolean) => OPTION_LABELS[key] ? (de ? OPTION_LABELS[key].de : OPTION_LABELS[key].en) : key

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_SHORT: Record<string, { de: string; en: string }> = {
  mon: { de: 'Mo', en: 'Mon' }, tue: { de: 'Di', en: 'Tue' }, wed: { de: 'Mi', en: 'Wed' },
  thu: { de: 'Do', en: 'Thu' }, fri: { de: 'Fr', en: 'Fri' }, sat: { de: 'Sa', en: 'Sat' }, sun: { de: 'So', en: 'Sun' },
}

const SPORT_ICON: Record<string, typeof Bike> = { cycling: Bike, running: Footprints, gym: Dumbbell, rest: Moon }

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

// ── Main sheet ──────────────────────────────────────────────────────────────

export default function PlanChangeInterview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const qc = useQueryClient()
  const titleId = useRef(`plan-change-${Math.random().toString(36).slice(2)}`)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  // Raw widget state — mapped to the typed payload on submit.
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [hoursText, setHoursText] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [priority, setPriority] = useState<'A' | 'B' | 'C' | ''>('')
  const [availDays, setAvailDays] = useState<Set<string>>(new Set(WEEKDAYS))
  const [availTouched, setAvailTouched] = useState(false)
  const [longDay, setLongDay] = useState<string>('')
  const [blackouts, setBlackouts] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<PlanChangeApplyResponse | null>(null)

  const interview = useQuery({
    queryKey: ['plan', 'change', 'interview'],
    queryFn: fetchPlanChangeInterview,
    enabled: open,
    staleTime: 0,
    retry: false,
  })

  // Reset flow whenever the sheet opens fresh.
  useEffect(() => {
    if (open) {
      setStep(1); setChoices({}); setHoursText(''); setEventDate(''); setPriority('')
      setAvailDays(new Set(WEEKDAYS)); setAvailTouched(false); setLongDay(''); setBlackouts(new Set()); setResult(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  const questions = interview.data?.questions ?? []
  const current = interview.data?.current
  const hasQuestion = (id: string) => questions.some((q) => q.id === id)

  // New-event detail row appears when the athlete signalled an event goal.
  const wantsEventDetails = choices.goal_changed === 'new_event'
    || ['race', 'fondo', 'audax'].includes(choices.goal_new ?? '')

  const buildAnswers = (): InterviewAnswers => {
    const a: InterviewAnswers = {}
    if (choices.felt_wrong) a.felt_wrong = choices.felt_wrong as InterviewAnswers['felt_wrong']
    if (choices.goal_changed) a.goal_changed = choices.goal_changed as InterviewAnswers['goal_changed']
    if (choices.goal_new) a.goal_new = choices.goal_new as InterviewAnswers['goal_new']
    if (wantsEventDetails) {
      if (eventDate) a.target_event_date = eventDate
      const t = choices.goal_new ?? choices.target_event_type
      if (t && ['race', 'fondo', 'audax', 'maintenance'].includes(t)) a.target_event_type = t as InterviewAnswers['target_event_type']
      if (priority) a.target_priority = priority
    }
    const hours = parseFloat(hoursText.replace(',', '.'))
    if (hoursText.trim() !== '' && Number.isFinite(hours)) a.weekly_hours = hours
    // Only submit availability the athlete actually SET — untouched defaults
    // must never register as a "days_changed" signal server-side.
    if (hasQuestion('days_available') && (availTouched || longDay !== '')) {
      const days = Object.fromEntries(WEEKDAYS.map((d) => [d, availDays.has(d)])) as unknown as NonNullable<InterviewAnswers['days_available']>
      if (longDay && availDays.has(longDay)) days.long_day = longDay
      a.days_available = days
    }
    if (hasQuestion('experience_level') && choices.experience_level) {
      a.experience_level = choices.experience_level as InterviewAnswers['experience_level']
    }
    if (hasQuestion('hard_day_blackouts') && blackouts.size > 0) a.hard_day_blackouts = [...blackouts]
    return a
  }

  const apply = useMutation({
    mutationFn: () => applyPlanChange(buildAnswers()),
    onSuccess: (res) => {
      setResult(res)
      setStep(3)
      // The plan changed server-side — every plan-derived surface refetches.
      void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      void qc.invalidateQueries({ queryKey: PLAN_ADAPTATIONS_KEY })
      void qc.invalidateQueries({ queryKey: ['coach'] })
    },
  })

  // ── Step 1 · Credit ──
  // Fresh plan (nothing planned yet in the window) → no stat row at all;
  // "0 Einheiten absolviert" would read as a scold, not a credit.
  const hasHistory = (current?.planned_sessions ?? 0) > 0
  const creditStats = useMemo(() => {
    if (!current || !hasHistory) return []
    const stats: Array<{ Icon: typeof Medal; val: string; lab: string }> = []
    stats.push({
      Icon: CalendarCheck2,
      val: `${current.sessions_done} / ${current.planned_sessions}`,
      lab: de ? 'Einheiten absolviert' : 'Sessions done',
    })
    if (current.compliance_pct != null) {
      stats.push({ Icon: Check, val: `${current.compliance_pct}%`, lab: de ? 'Plantreue' : 'Compliance' })
    }
    if (current.ctl_delta_since_start != null) {
      const v = current.ctl_delta_since_start
      stats.push({ Icon: TrendingUp, val: `${v > 0 ? '+' : ''}${String(v).replace('.', de ? ',' : '.')}`, lab: 'Fitness (CTL)' })
    }
    return stats
  }, [current, hasHistory, de])

  const weeksDone = current?.weeks_completed ?? 0

  const stepDots = (
    <div className="flex items-center justify-center" style={{ gap: 6 }}>
      {[1, 2, 3].map((s) => (
        <span key={s} style={{
          width: s === step ? 22 : 7, height: 7, borderRadius: 999,
          background: s === step ? ACCENT : s < step ? 'var(--color-accent-soft)' : 'var(--color-surface-3)',
          transition: 'width 0.2s ease',
        }} />
      ))}
    </div>
  )

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
            <div className="flex items-center justify-between" style={{ padding: '10px 20px 6px', gap: 12 }}>
              <span id={titleId.current} style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                {de ? 'Plan anpassen' : 'Adjust plan'}
              </span>
              <button
                type="button" aria-label={de ? 'Schließen' : 'Close'} onClick={onClose}
                className="flex items-center justify-center shrink-0"
                style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid var(--color-rule)', background: 'transparent', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '2px 20px 10px' }}>{stepDots}</div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* ── Step 1 · Credit ── */}
              {step === 1 && (
                <>
                  <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 14 }}>
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <Medal size={18} style={{ color: 'var(--color-gold)' }} />
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
                        {de ? 'Was du schon geschafft hast' : 'What you have already done'}
                      </span>
                    </span>
                    {interview.isLoading && (
                      <span className="inline-flex items-center" style={{ gap: 8, fontSize: 13, color: 'var(--color-muted)' }}>
                        <Loader2 size={15} className="animate-spin" /> {de ? 'Lade deine Bilanz …' : 'Loading your ledger …'}
                      </span>
                    )}
                    {current && (
                      <>
                        <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                          {hasHistory
                            ? (de
                              ? `${weeksDone > 0 ? `${weeksDone} ${weeksDone === 1 ? 'Woche' : 'Wochen'} im Plan — alles` : 'Alles'}, was du trainiert hast, zählt weiter. Der neue Plan baut darauf auf, nichts geht verloren.`
                              : `${weeksDone > 0 ? `${weeksDone} ${weeksDone === 1 ? 'week' : 'weeks'} into the plan — everything` : 'Everything'} you trained still counts. The new plan builds on it; nothing is lost.`)
                            : (de
                              ? 'Dein Plan ist noch frisch. Der neue Plan baut auf deiner aktuellen Fitness auf — jede gefahrene Einheit steckt schon darin.'
                              : 'Your plan is still fresh. The new plan builds on your current fitness — every ride you have done is already in it.')}
                        </p>
                        <div className="flex">
                          {creditStats.map((s, i) => (
                            <div key={i} className="flex-1 flex flex-col items-start" style={{ gap: 3 }}>
                              <s.Icon size={15} style={{ color: ACCENT }} />
                              <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{s.val}</span>
                              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{s.lab}</span>
                            </div>
                          ))}
                        </div>
                        {current.favorite_session?.title && (
                          <div className="flex items-center rounded-2xl px-3.5 py-2.5" style={{ gap: 9, background: 'var(--color-surface-2)' }}>
                            <Sparkles size={14} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>
                              {de
                                ? `Am häufigsten absolviert: ${current.favorite_session.title} (${current.favorite_session.completed}×)`
                                : `Most completed: ${current.favorite_session.title} (${current.favorite_session.completed}×)`}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {interview.isError && (
                      <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                        {de ? 'Bilanz gerade nicht verfügbar — du kannst trotzdem fortfahren.' : 'Ledger unavailable right now — you can still continue.'}
                      </p>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.45 }}>
                    {de
                      ? 'Als Nächstes: ein paar kurze Fragen — nur, was dein Profil nicht schon weiß.'
                      : 'Next: a few short questions — only what your profile can’t already answer.'}
                  </p>
                </>
              )}

              {/* ── Step 2 · Delta questions ── */}
              {step === 2 && questions.map((q: InterviewQuestion) => (
                <div key={q.id} className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.35 }}>
                    {de ? q.prompt_de : q.prompt_en}
                  </span>

                  {/* choice → pill group */}
                  {q.type === 'choice' && q.options && (
                    <div className="flex flex-wrap" style={{ gap: 8 }}>
                      {q.options.map((opt) => (
                        <Pill key={opt} active={choices[q.id] === opt}
                          onClick={() => setChoices((c) => ({ ...c, [q.id]: c[q.id] === opt ? '' : opt }))}>
                          {optLabel(opt, de)}
                        </Pill>
                      ))}
                    </div>
                  )}

                  {/* weekly_hours → numeric input */}
                  {q.id === 'weekly_hours' && (
                    <input
                      type="number" inputMode="decimal" min={1} max={40} step={0.5} value={hoursText}
                      onChange={(e) => setHoursText(e.target.value)}
                      placeholder={de ? 'z. B. 8 (leer = unverändert)' : 'e.g. 8 (blank = unchanged)'}
                      className="rounded-2xl"
                      style={{ padding: '12px 14px', fontSize: 15, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', outline: 'none', width: '100%' }}
                    />
                  )}

                  {/* days_available → availability chips + long-day picker */}
                  {q.id === 'days_available' && (
                    <>
                      <div className="flex" style={{ gap: 6 }}>
                        {WEEKDAYS.map((d) => {
                          const on = availDays.has(d)
                          return (
                            <button key={d} type="button"
                              onClick={() => { setAvailTouched(true); setAvailDays((s) => { const n = new Set(s); if (n.has(d)) { n.delete(d); if (longDay === d) setLongDay('') } else n.add(d); return n }) }}
                              className="flex-1 rounded-2xl"
                              style={{ padding: '10px 0', minHeight: 44, fontSize: 12, fontWeight: 700, background: on ? 'var(--color-accent-soft)' : 'var(--color-surface-2)', border: `1px solid ${on ? ACCENT : 'var(--color-rule)'}`, color: on ? ACCENT : 'var(--color-muted)' }}>
                              {DAY_SHORT[d][de ? 'de' : 'en']}
                            </button>
                          )
                        })}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Langer Tag' : 'Long day'}</span>
                      <div className="flex flex-wrap" style={{ gap: 6 }}>
                        {[...availDays].sort((a, b) => WEEKDAYS.indexOf(a as typeof WEEKDAYS[number]) - WEEKDAYS.indexOf(b as typeof WEEKDAYS[number])).map((d) => (
                          <Pill key={d} active={longDay === d} onClick={() => setLongDay(longDay === d ? '' : d)}>
                            {DAY_SHORT[d][de ? 'de' : 'en']}
                          </Pill>
                        ))}
                      </div>
                    </>
                  )}

                  {/* hard_day_blackouts → multi-select day chips */}
                  {q.id === 'hard_day_blackouts' && (
                    <div className="flex" style={{ gap: 6 }}>
                      {WEEKDAYS.map((d) => {
                        const on = blackouts.has(d)
                        return (
                          <button key={d} type="button"
                            onClick={() => setBlackouts((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n })}
                            className="flex-1 rounded-2xl"
                            style={{ padding: '10px 0', minHeight: 44, fontSize: 12, fontWeight: 700, background: on ? 'var(--color-amber-soft)' : 'var(--color-surface-2)', border: `1px solid ${on ? 'var(--color-amber)' : 'var(--color-rule)'}`, color: on ? 'var(--color-amber)' : 'var(--color-muted)' }}>
                            {DAY_SHORT[d][de ? 'de' : 'en']}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* New-event details ride along under the goal question */}
                  {(q.id === 'goal_changed' || q.id === 'goal_new') && wantsEventDetails && (
                    <div className="flex flex-col" style={{ gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Event-Datum' : 'Event date'}</span>
                      <input
                        type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 10)}
                        className="rounded-2xl"
                        style={{ padding: '12px 14px', fontSize: 15, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', outline: 'none', width: '100%', colorScheme: 'dark' }}
                      />
                      {q.id === 'goal_changed' && (
                        <>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Event-Typ' : 'Event type'}</span>
                          <div className="flex flex-wrap" style={{ gap: 8 }}>
                            {(['race', 'fondo', 'audax'] as const).map((t) => (
                              <Pill key={t} active={choices.target_event_type === t}
                                onClick={() => setChoices((c) => ({ ...c, target_event_type: c.target_event_type === t ? '' : t }))}>
                                {optLabel(t, de)}
                              </Pill>
                            ))}
                          </div>
                        </>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Priorität' : 'Priority'}</span>
                      <div className="flex" style={{ gap: 8 }}>
                        {(['A', 'B', 'C'] as const).map((p) => (
                          <Pill key={p} active={priority === p} onClick={() => setPriority(priority === p ? '' : p)}>{p}</Pill>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {step === 2 && apply.isError && (
                <p style={{ fontSize: 12.5, color: 'var(--color-alert)', lineHeight: 1.4 }}>
                  {(() => {
                    const detail = (apply.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                    return detail ?? (de ? 'Das hat nicht geklappt — bitte noch einmal versuchen.' : 'That didn’t work — please try again.')
                  })()}
                </p>
              )}

              {/* ── Step 3 · New week ── */}
              {step === 3 && result && (
                <>
                  <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 12 }}>
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <Sparkles size={18} style={{ color: ACCENT }} />
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
                        {de ? 'Dein neuer Plan steht' : 'Your new plan is ready'}
                      </span>
                      {result.phase && (
                        <span className="ml-auto inline-flex items-center rounded-full px-3 py-1" style={{ background: 'var(--color-accent-soft)', color: ACCENT, fontSize: 11.5, fontWeight: 700 }}>
                          {phaseLabel(result.phase, de)}
                        </span>
                      )}
                    </span>
                    {/* Credit lines — CTL anchor + sacred sessions */}
                    <div className="flex flex-col" style={{ gap: 8 }}>
                      {result.ctl_anchor != null && (
                        <span className="inline-flex items-start" style={{ gap: 9 }}>
                          <Anchor size={14} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                            {de
                              ? `Verankert an deiner aktuellen Fitness (CTL ${Math.round(result.ctl_anchor)}) — jede absolvierte Einheit zählt weiter.`
                              : `Anchored to your current fitness (CTL ${Math.round(result.ctl_anchor)}) — every completed session still counts.`}
                          </span>
                        </span>
                      )}
                      {(result.preserved_sessions ?? 0) > 0 && (
                        <span className="inline-flex items-start" style={{ gap: 9 }}>
                          <ShieldCheck size={14} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                            {de
                              ? `${result.preserved_sessions} eigene ${result.preserved_sessions === 1 ? 'Einheit bleibt' : 'Einheiten bleiben'} unangetastet.`
                              : `${result.preserved_sessions} of your own ${result.preserved_sessions === 1 ? 'session stays' : 'sessions stay'} untouched.`}
                          </span>
                        </span>
                      )}
                      {/* Hours reconciliation — why the delivered week can start
                          below the stated hours (CTL-anchored ramp). */}
                      {result.hours_note != null && (
                        <span className="inline-flex items-start" style={{ gap: 9 }}>
                          <Clock size={14} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                            {de ? result.hours_note.de : result.hours_note.en}
                          </span>
                        </span>
                      )}
                      {result.hours_note == null && result.planned_hours != null && (
                        <span className="inline-flex items-start" style={{ gap: 9 }}>
                          <Clock size={14} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                            {de
                              ? `Geplant: ~${result.planned_hours.toFixed(1).replace('.', ',')} h diese Woche.`
                              : `Planned: ~${result.planned_hours.toFixed(1)} h this week.`}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* The regenerated week */}
                  <div className="flex flex-col rounded-[24px] p-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', gap: 10 }}>
                    <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>
                      {de ? 'DEINE NEUE WOCHE' : 'YOUR NEW WEEK'}
                    </span>
                    {result.week.map((d) => {
                      const isRest = d.template_id === 'rest_day' || d.sport === 'rest'
                      const Icon = isRest ? Moon : (SPORT_ICON[d.sport] ?? Bike)
                      const col = isRest ? 'var(--color-recovery)' : d.sport === 'running' ? 'var(--color-exercise)' : d.sport === 'gym' ? 'var(--color-amber)' : 'var(--color-strain)'
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
                    {result.week.length === 0 && (
                      <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                        {de ? 'Die Woche wird gerade aufgebaut — schau gleich im Plan nach.' : 'The week is being built — check the plan in a moment.'}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer CTA */}
            <div style={{ padding: '12px 20px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', borderTop: '1px solid var(--color-rule)' }}>
              {step === 1 && (
                <button type="button" onClick={() => setStep(2)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full"
                  style={{ minHeight: 50, background: ACCENT, color: '#FFFFFF', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                  {de ? 'Weiter' : 'Continue'} <ChevronRight size={18} strokeWidth={2.4} />
                </button>
              )}
              {step === 2 && (
                <button type="button" disabled={apply.isPending} onClick={() => apply.mutate()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full"
                  style={{ minHeight: 50, background: ACCENT, color: '#FFFFFF', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: apply.isPending ? 0.7 : 1 }}>
                  {apply.isPending
                    ? (<><Loader2 size={17} className="animate-spin" /> {de ? 'Plan wird neu aufgebaut …' : 'Rebuilding your plan …'}</>)
                    : (<>{de ? 'Neue Woche erstellen' : 'Build my new week'} <Sparkles size={17} /></>)}
                </button>
              )}
              {step === 3 && (
                <button type="button" onClick={onClose}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full"
                  style={{ minHeight: 50, background: ACCENT, color: '#FFFFFF', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                  <Check size={18} strokeWidth={2.6} /> {de ? 'Zum neuen Plan' : 'See the new plan'}
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

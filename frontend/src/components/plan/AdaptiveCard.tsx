/**
 * AdaptiveCard (pen JnlgK) + "Was sich geändert hat" timeline sheet —
 * the violet adaptation-transparency surface (V3 spec §3).
 *
 * The card renders the NEWEST rows of the live plan_adaptations feed
 * (GET /plan/adaptations) verbatim — no-guilt register, the plan works FOR
 * the athlete. "Was sich geändert hat" opens the full timeline; every entry
 * deep-links to the AI Coach (spec law #2).
 *
 * Renders nothing while the feed is empty — an adaptation card without an
 * adaptation would be noise.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  RefreshCw, ChevronRight, X, Moon, CalendarX2, Users, Thermometer,
  SlidersHorizontal, Sparkles, HeartPulse, MessageCircle, ArrowRight,
} from 'lucide-react'
import { springs } from '../../utils/motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useLocale } from '../../contexts/LocaleContext'
import { usePlanAdaptations, PLAN_ADAPTATIONS_KEY } from '../../hooks/usePlanAdaptations'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import { WEEK_CURRENT_KEY_ROOT, useCurrentWeek } from '../../hooks/useCurrentWeek'
import type { PlanAdaptation } from '../../api/plan'

/** "Rückgängig" is offered on the NEWEST feed row when it is a user
 *  modification inside the server's 60-min undo window (the server enforces
 *  the window again — this only decides whether to show the affordance). */
export function undoEligible(a: PlanAdaptation | undefined, newestId: number | undefined, now = Date.now()): boolean {
  if (!a || a.id !== newestId) return false
  if (a.rule !== 'user_modified') return false
  return now - new Date(a.created_at).getTime() < 60 * 60 * 1000
}

function UndoFeedButton({ de }: { de: boolean }) {
  const qc = useQueryClient()
  const undo = useMutation({
    mutationFn: async () => (await apiClient.post<{ success?: boolean; reason?: string }>('/workouts/today/modify/undo')).data,
    onSuccess: (res) => {
      if (res.success) {
        void qc.invalidateQueries({ queryKey: PLAN_ADAPTATIONS_KEY })
        void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
        void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      }
    },
  })
  return (
    <button
      type="button"
      disabled={undo.isPending || undo.isSuccess}
      onClick={() => undo.mutate()}
      className="inline-flex items-center"
      style={{ gap: 4, fontSize: 11, fontWeight: 700, color: VIOLET, background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 24, opacity: undo.isPending ? 0.6 : 1 }}
    >
      <RotateCcw size={12} /> {undo.isPending ? (de ? 'Wird zurückgesetzt…' : 'Undoing…') : (de ? 'Rückgängig' : 'Undo')}
    </button>
  )
}

const VIOLET = 'var(--color-violet)'
const VIOLET_SOFT = 'var(--color-violet-soft)'

/** Signal → icon, mirroring the pen card's per-row glyphs (event_busy, groups …). */
function signalIcon(a: PlanAdaptation) {
  const s = `${a.signal} ${a.rule}`.toLowerCase()
  if (/(sleep|schlaf)/.test(s)) return Moon
  if (/(missed|skip|verpasst)/.test(s)) return CalendarX2
  if (/(group|crew|extra_load|social)/.test(s)) return Users
  if (/(illness|heat|fever|krank|weather)/.test(s)) return Thermometer
  if (/(hrv|readiness|recovery)/.test(s)) return HeartPulse
  if (/(plan_change|user)/.test(s)) return SlidersHorizontal
  if (/(plan_built|plan_build)/.test(s)) return Sparkles
  return RefreshCw
}

const fmtTime = (iso: string, de: boolean) =>
  new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso)) + (de ? ' Uhr' : '')

/** Day bucket label for the timeline — Heute / Gestern / weekday + date. */
function dayLabel(iso: string, de: boolean): string {
  const d = new Date(iso)
  const today = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000)
  if (diffDays === 0) return de ? 'Heute' : 'Today'
  if (diffDays === 1) return de ? 'Gestern' : 'Yesterday'
  return new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).format(d)
}

/** A feed row is "superseded" when the session it announced for a date no
 *  longer matches the plan currently scheduled for that date — a later
 *  adaptation (or a plan rebuild) has overtaken it. History is append-only, so
 *  the row stays; the marker just stops it masquerading as current truth.
 *
 *  Only judged for dates we can actually see (present in the loaded week map).
 *  Rows outside the loaded window, or with no after-session identity, are never
 *  marked — we don't guess. `currentByDate` maps ISO date → the day's current
 *  template_id (preferred) and title. */
export function isSuperseded(
  a: PlanAdaptation,
  currentByDate: Map<string, { template_id: string | null; title: string }>,
): boolean {
  const cur = a.target_date ? currentByDate.get(a.target_date) : undefined
  if (!cur) return false
  const after = a.after
  if (!after) return false
  const afterTid = typeof after.template_id === 'string' ? after.template_id : null
  if (afterTid && cur.template_id) return afterTid !== cur.template_id
  const afterTitle = typeof after.title === 'string' ? after.title : null
  if (afterTitle && cur.title) return afterTitle.trim() !== cur.title.trim()
  return false
}

/** Compact before→after diff line from the log row's JSON payloads. */
function diffLine(a: PlanAdaptation, de: boolean): string | null {
  const pick = (o: Record<string, unknown> | null) => {
    if (!o) return null
    const title = typeof o.title === 'string' ? o.title : typeof o.phase === 'string' ? (de ? `Phase ${o.phase}` : `Phase ${o.phase}`) : null
    const tss = typeof o.target_tss === 'number' ? `${Math.round(o.target_tss)} TSS` : null
    return [title, tss].filter(Boolean).join(' · ') || null
  }
  const b = pick(a.before)
  const af = pick(a.after)
  if (b && af) return `${b} → ${af}`
  return null
}

// ── Card ────────────────────────────────────────────────────────────────────

export default function AdaptiveCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [timelineOpen, setTimelineOpen] = useState(false)
  const { data } = usePlanAdaptations()
  const feed = data?.adaptations ?? []

  // Newest entry drives the header; the two newest DISTINCT messages are
  // announced (repeated rebuilds the same day emit identical messages —
  // showing them twice would read as a glitch).
  const newest = feed[0]
  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: PlanAdaptation[] = []
    for (const a of feed) {
      if (seen.has(a.message_de)) continue
      seen.add(a.message_de)
      out.push(a)
      if (out.length === 2) break
    }
    return out
  }, [feed])

  // "über Nacht" only when the newest adaptation actually landed before 9 am today.
  const overnight = useMemo(() => {
    if (!newest) return false
    const d = new Date(newest.created_at)
    const now = new Date()
    return d.toDateString() === now.toDateString() && d.getHours() < 9
  }, [newest])

  if (!newest) return null

  return (
    <>
      <div
        className="flex flex-col rounded-[24px]"
        style={{ background: VIOLET_SOFT, border: `1px solid ${VIOLET}`, padding: '16px 18px', gap: 12 }}
      >
        {/* Head — autorenew + title | time (pen kH4QP) */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center" style={{ gap: 8 }}>
            <RefreshCw size={18} strokeWidth={2.2} style={{ color: VIOLET }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
              {overnight ? (de ? 'Plan über Nacht angepasst' : 'Plan adapted overnight') : (de ? 'Plan angepasst' : 'Plan adapted')}
            </span>
          </span>
          <span className="num-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>
            {fmtTime(newest.created_at, de)}
          </span>
        </div>

        {/* Feed rows — verbatim no-guilt messages (pen ccNBj / BHhWu) */}
        {rows.map((a) => {
          const Icon = signalIcon(a)
          return (
            <div key={a.id} className="flex items-center" style={{ gap: 9 }}>
              <Icon size={15} strokeWidth={2.2} style={{ color: VIOLET, flexShrink: 0 }} />
              <span className="flex-1 min-w-0" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
                {de ? a.message_de : a.message_en}
              </span>
              {undoEligible(a, newest?.id) && <UndoFeedButton de={de} />}
            </div>
          )
        })}

        {/* Link — opens the timeline (pen f3coIy) */}
        <button
          type="button"
          onClick={() => setTimelineOpen(true)}
          className="inline-flex items-center self-start"
          style={{ gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 24 }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: VIOLET }}>
            {de ? 'Was sich geändert hat' : 'See what changed'}
          </span>
          <ChevronRight size={14} strokeWidth={2.4} style={{ color: VIOLET }} />
        </button>
      </div>

      <AdaptationTimelineSheet open={timelineOpen} onClose={() => setTimelineOpen(false)} feed={feed} />
    </>
  )
}

// ── Timeline sheet — "Was sich geändert hat" ────────────────────────────────

export function AdaptationTimelineSheet({ open, onClose, feed }: {
  open: boolean
  onClose: () => void
  feed: PlanAdaptation[]
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const titleId = useRef(`adapt-timeline-${Math.random().toString(36).slice(2)}`)

  // Current plan by date — lets us flag feed rows the plan has since overtaken.
  // Only fetched while the sheet is open; a miss just means nothing is marked.
  const { data: week } = useCurrentWeek()
  const currentByDate = useMemo(() => {
    const m = new Map<string, { template_id: string | null; title: string }>()
    for (const d of week?.days ?? []) {
      m.set(d.date, { template_id: d.template_id ?? null, title: d.title })
    }
    return m
  }, [week])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  // Group newest-first entries by calendar day.
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: PlanAdaptation[] }> = []
    for (const a of feed) {
      const label = dayLabel(a.created_at, de)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(a)
      else out.push({ label, items: [a] })
    }
    return out
  }, [feed, de])

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="adapt-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 500 }}
          />
          <motion.div
            key="adapt-sheet"
            role="dialog" aria-modal="true" aria-labelledby={titleId.current}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={reduce ? { duration: 0.15 } : springs.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', bottom: 0,
              zIndex: 501, width: '100%', maxWidth: 480, maxHeight: '86vh',
              display: 'flex', flexDirection: 'column',
              background: 'var(--color-paper)', borderTop: '1px solid var(--color-rule)',
              borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
            }}
          >
            {/* Grab handle */}
            <div className="flex justify-center" style={{ paddingTop: 10 }}>
              <div style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--color-surface-3)' }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between" style={{ padding: '10px 20px 6px', gap: 12 }}>
              <span className="inline-flex items-center" style={{ gap: 9 }}>
                <RefreshCw size={18} strokeWidth={2.2} style={{ color: VIOLET }} />
                <span id={titleId.current} style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                  {de ? 'Was sich geändert hat' : 'What changed'}
                </span>
              </span>
              <button
                type="button" aria-label={de ? 'Schließen' : 'Close'} onClick={onClose}
                className="flex items-center justify-center shrink-0"
                style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid var(--color-rule)', background: 'transparent', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Timeline */}
            <div style={{ padding: '4px 20px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {groups.map((g) => (
                <div key={g.label} className="flex flex-col" style={{ gap: 8 }}>
                  <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                    {g.label}
                  </span>
                  {g.items.map((a) => {
                    const Icon = signalIcon(a)
                    const diff = diffLine(a, de)
                    const superseded = isSuperseded(a, currentByDate)
                    return (
                      <div key={a.id} className="flex items-start rounded-2xl p-3.5" style={{ gap: 11, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', opacity: superseded ? 0.72 : 1 }}>
                        <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 30, height: 30, background: VIOLET_SOFT, marginTop: 1 }}>
                          <Icon size={15} strokeWidth={2.2} style={{ color: VIOLET }} />
                        </span>
                        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink)', lineHeight: 1.4 }}>
                            {de ? a.message_de : a.message_en}
                          </span>
                          {superseded && (
                            <span className="inline-flex items-center self-start rounded-full" style={{ gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-muted)', background: 'var(--color-surface-2)', padding: '2px 8px' }}>
                              {de ? 'Überholt' : 'Superseded'}
                            </span>
                          )}
                          {diff && (
                            <span className="num-mono inline-flex items-center" style={{ gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                              <ArrowRight size={11} style={{ color: VIOLET }} /> {diff}
                            </span>
                          )}
                          <div className="flex items-center justify-between" style={{ gap: 8 }}>
                            <span className="num-mono" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>
                              {fmtTime(a.created_at, de)}
                            </span>
                            {/* Spec law #2 — every entry deep-links to the AI Coach. */}
                            <span className="inline-flex items-center" style={{ gap: 12 }}>
                              {undoEligible(a, feed[0]?.id) && <UndoFeedButton de={de} />}
                              <Link to="/coach" onClick={onClose} className="inline-flex items-center" style={{ gap: 4, fontSize: 11, fontWeight: 700, color: VIOLET }}>
                                <MessageCircle size={12} /> {de ? 'Coach fragen' : 'Ask coach'}
                              </Link>
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              {groups.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45, padding: '8px 0 16px' }}>
                  {de
                    ? 'Noch keine Anpassungen in den letzten 14 Tagen — dein Plan läuft wie geplant.'
                    : 'No adaptations in the last 14 days — your plan is running as planned.'}
                </p>
              )}
              {/* No-guilt footer */}
              <p style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.45, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                {de
                  ? 'Der Plan arbeitet für dich: Verpasstes wird neu verteilt, nichts geht verloren — und nichts wird angekreidet.'
                  : 'The plan works for you: missed work is reflowed, nothing is lost — and nothing is held against you.'}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(sheet, document.body)
}

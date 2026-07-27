/**
 * SessionOfTheDay — the ONE "Einheit des Tages" card, mounted by BOTH the
 * Today tab and the Train (Plan) tab. Driven exclusively by useTodaySession
 * (brief coerced to the plan row + ONE DailyDecision + honest week-plan
 * fallback) so title/TSS/duration/zone badge/blocks are pixel-identical on
 * both tabs by construction.
 *
 * "Anpassen": a small sheet with the audited modifier's vocabulary (shorter /
 * easier / harder / indoor) → POST /workouts/today/modify — the EXACT chat
 * pipeline (rails, PlannedWorkout write, audit row + undo window, feed row).
 * The server's rails may downgrade or refuse; the returned reason is narrated
 * honestly. "Rückgängig" wires the same 60-min server-enforced undo window.
 */
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import {
  ChevronDown, ChevronRight, Clock, Flame, Home, ListChecks, RefreshCw,
  SlidersHorizontal, Sparkles, Zap,
} from 'lucide-react'
import { apiClient } from '../../api/client'
import { workoutDisplayTitle, workoutDisplayRationale, type Adaptations } from '../../api/coach'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import { WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { PLAN_ADAPTATIONS_KEY } from '../../hooks/usePlanAdaptations'
import { useTodaySession, sessionIntensity } from '../../hooks/useTodaySession'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { usePMC } from '../../hooks/usePMC'
import { daysToEvent, latestLoad, localDayKey } from '../../utils/loadMetrics'
import { useLocale } from '../../contexts/LocaleContext'
import BlockBars from '../workout/BlockBars'
import { glassCardStyle, GLASS_CARD_MARKER, GLASS_PAPER_2, GLASS_BLUR } from './glassCard'

// Also mounted on the Train (Plan) tab, which has no road behind it — glass
// there is a harmless, near-imperceptible tone shift (blurring a solid page
// background is a no-op; the 72%-paper-2 mix still reads as a distinct card
// against var(--color-paper)), so this stays ONE shared style rather than a
// per-tab special case (finding 3: one glass system, not a patchwork).
const cardStyle = glassCardStyle

// ── The audited modifier's exposed subset (workout_modifier vocabulary) ──────
interface AdaptOption {
  key: string
  modification_type: 'shorten' | 'easier' | 'harder' | 'indoor'
  duration_min?: number
  de: string
  en: string
  deSub: string
  enSub: string
}
const ADAPT_OPTIONS: AdaptOption[] = [
  { key: 'shorten45', modification_type: 'shorten', duration_min: 45, de: 'Kürzer · 45 min', en: 'Shorter · 45 min', deSub: 'Gleiche Absicht, weniger Zeit', enSub: 'Same intent, less time' },
  { key: 'shorten30', modification_type: 'shorten', duration_min: 30, de: 'Kürzer · 30 min', en: 'Shorter · 30 min', deSub: 'Für den vollen Terminkalender', enSub: 'For the packed day' },
  { key: 'easier', modification_type: 'easier', de: 'Leichter', en: 'Easier', deSub: 'Eine Stufe runter in der Kaskade', enSub: 'One step down the cascade' },
  { key: 'harder', modification_type: 'harder', de: 'Härter', en: 'Harder', deSub: 'Eine Stufe rauf — Rails passen auf', enSub: 'One step up — rails watch over it' },
  { key: 'indoor', modification_type: 'indoor', de: 'Indoor', en: 'Indoor', deSub: 'Rolle statt Straße, Watt unverändert', enSub: 'Trainer instead of road, watts unchanged' },
]

export interface ModifyResult {
  success: boolean
  found?: boolean
  reason: string
  title?: string | null
  duration_min?: number
  predicted_tss?: number
  template_id?: string
  rails_downgraded?: boolean
}

/**
 * Patch a cached coach-brief with an authoritative /workouts/today/modify
 * result. The modify response already carries the full new session (title,
 * duration, TSS, template) so the visible card updates INSTANTLY and STAYS
 * updated — critical because the server brief read-path can hang or return a
 * null prescribed_workout right after a plan mutation (it busts the cached
 * brief and then tries to regenerate via the LLM). We therefore treat the
 * modify response as source of truth and never let a slow/failed brief refetch
 * blank the just-adapted card.
 *
 * Returns the same reference when there is nothing to patch (no workout on the
 * brief) so react-query can skip a needless re-render.
 */
export function patchBriefWorkoutFromModify(old: unknown, res: ModifyResult): unknown {
  const brief = old as { prescribed_workout?: Record<string, unknown> | null } | undefined
  if (!brief?.prescribed_workout) return old
  return {
    ...brief,
    prescribed_workout: {
      ...brief.prescribed_workout,
      // A shortened/eased session no longer matches its old interval blocks;
      // drop them so the card shows the honest new numbers rather than a stale
      // power profile. The blocks re-hydrate on the next natural brief refetch.
      ...(res.template_id || res.duration_min != null ? { blocks: [] } : {}),
      ...(res.title ? { title: res.title, title_de: null } : {}),
      ...(res.duration_min != null ? { duration_minutes: res.duration_min } : {}),
      ...(res.predicted_tss != null ? { predicted_tss: res.predicted_tss } : {}),
      ...(res.template_id ? { template_id: res.template_id } : {}),
    },
  }
}

/** The sleep score that may appear in the "Warum diese Einheit?" evidence list.
 *
 *  That list is presented as the inputs the engine weighed for TODAY's
 *  session. The row it reads from is the newest one carrying ANY overnight
 *  field, so on a watch that stopped syncing it served a nine-day-old
 *  "Schlaf 78/100" as a reason for today's prescription.
 *
 *  Unlike a sleep card, this chip cannot simply be dated: its entire claim is
 *  "this is what today's decision was built on", and a dated chip would state
 *  something that is still false. So a non-current row yields null, the
 *  evidence list is one chip shorter, and every chip that remains is true. */
export function sleepEvidenceScore(
  latest: { date?: string | null; sleep_score?: number | null } | null | undefined,
  todayKey: string,
): number | null {
  if (!latest) return null
  return (latest.date ?? '').slice(0, 10) === todayKey ? (latest.sleep_score ?? null) : null
}

export default function SessionOfTheDay() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const {
    brief, workout, isActiveTrainingDay, fallback, weekToday, refetchBrief,
  } = useTodaySession()

  // Sport chip — the prescribed card is bike-family unless the category says run.
  const isRunWorkout = (workout?.category ?? '').toLowerCase().includes('run')

  // "Why this?" inputs — the exact signals the engine weighed (all real).
  const today = useMemo(() => new Date(), [])
  const { data: pmc } = usePMC(90)
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 30), [today]), today)
  const { data: profile } = useAthleteProfile()
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const goalName = athlete?.goal_target as string | undefined
  const daysToGoal = daysToEvent(profile?.target_event_date)
    ?? (athlete?.days_to_goal as number | undefined)
    ?? null
  const pmcBio = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = pmcBio?.hrv as Record<string, unknown> | undefined
  const hrvDelta = hrv?.delta_pct as number | null | undefined
  const metrics = metricsResp?.metrics ?? []
  const latest = [...metrics].reverse().find((m) => m.hrv_status != null || m.resting_hr != null || m.sleep_score != null) ?? null
  // Freshness gate — see `sleepEvidenceScore`: a stale overnight row must not
  // be listed as an input to today's session pick.
  const sleepScore = sleepEvidenceScore(latest, localDayKey(today))
  const load = latestLoad(pmc?.entries)
  const tsb = load?.tsb ?? null
  const atl = load?.atl ?? null
  const whyInputs = useMemo(() => {
    const chips: { l: string; v: string }[] = []
    if (typeof tsb === 'number') chips.push({ l: 'Form', v: `${tsb >= 0 ? '+' : ''}${tsb} TSB` })
    if (atl != null) chips.push({ l: de ? 'Ermüdung' : 'Fatigue', v: `${atl} ATL` })
    if (typeof hrvDelta === 'number') chips.push({ l: 'HRV', v: `${hrvDelta >= 0 ? '+' : ''}${Math.round(hrvDelta)}% vs. Baseline` })
    if (sleepScore != null) chips.push({ l: de ? 'Schlaf' : 'Sleep', v: `${Math.round(sleepScore)}/100` })
    if (typeof daysToGoal === 'number' && goalName) chips.push({ l: de ? 'Event' : 'Event', v: `${daysToGoal} ${de ? 'Tage bis' : 'days to'} ${goalName.length > 18 ? goalName.slice(0, 17) + '…' : goalName}` })
    return chips
  }, [tsb, atl, hrvDelta, sleepScore, daysToGoal, goalName, de])
  const frameworks = (brief?.frameworks_cited ?? []).slice(0, 3)

  const adaptations = (brief as { adaptations?: Adaptations | null } | undefined)?.adaptations ?? null
  const [whyOpen, setWhyOpen] = useState(false)

  const wIntensity = useMemo(() => sessionIntensity(workout, de), [workout, de])
  const wBlocks = workout?.blocks ?? []
  const wBlockSummary = wBlocks.length > 0
    ? wBlocks.slice(0, 5).map((b) => b.name).filter(Boolean).join(' → ')
    : null

  // ── Honest week-plan fallback card (brief unavailable, finding #1) ─────────
  if (fallback === 'planned_session' && weekToday) {
    return (
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={{ ...cardStyle, borderColor: 'var(--color-accent)' }} {...GLASS_CARD_MARKER}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Zap size={16} strokeWidth={2.4} style={{ color: 'var(--color-accent)' }} />
            <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-accent)' }}>{de ? 'Geplante Einheit' : 'Planned session'}</span>
          </div>
          <span className="rounded-full px-2.5 py-1" style={{ background: 'var(--color-surface-2)', fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>
            {de ? 'Aus dem Wochenplan' : 'From the week plan'}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{weekToday.title}</h2>
          <div className="flex items-center gap-3 flex-wrap">
            {(weekToday.duration_seconds_target ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 num-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                <Clock size={13} style={{ color: 'var(--color-muted)' }} /> {Math.round((weekToday.duration_seconds_target ?? 0) / 60)} min
              </span>
            )}
            {(weekToday.target_tss ?? 0) > 0 && (
              <span className="num-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{Math.round(weekToday.target_tss ?? 0)} TSS</span>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.4 }}>
          {de
            ? 'Der Coach-Brief ist gerade nicht verfügbar — das hier ist dein Plan, unverändert.'
            : 'The coach brief is unavailable right now — this is your plan, unchanged.'}
        </p>
        <div className="flex gap-2">
          <Link
            to="/workout/today"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full min-h-[44px] px-3"
            style={{ background: 'var(--color-accent)', color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}
          >
            <ListChecks size={15} /> {de ? 'Workout ansehen' : 'View workout'}
          </Link>
          <button
            type="button"
            onClick={() => refetchBrief()}
            className="inline-flex items-center justify-center gap-1.5 rounded-full min-h-[44px] px-4"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}
          >
            <RefreshCw size={14} style={{ color: 'var(--color-ink-2)' }} /> {de ? 'Neu laden' : 'Retry'}
          </button>
        </div>
      </div>
    )
  }

  if (!isActiveTrainingDay || !workout) return null

  const displayTitle = workoutDisplayTitle(workout, de)

  return (
    <div
      className="rounded-[24px] p-5 hover-card flex flex-col gap-[18px]"
      style={{
        background: `linear-gradient(125deg, color-mix(in srgb, var(--color-accent) 16%, ${GLASS_PAPER_2}) 0%, ${GLASS_PAPER_2} 72%)`,
        border: '1px solid var(--color-accent)',
        ...GLASS_BLUR,
      }}
      {...GLASS_CARD_MARKER}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={16} strokeWidth={2.4} style={{ color: 'var(--color-accent)' }} />
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-accent)' }}>{de ? 'Einheit des Tages' : 'Session of the day'}</span>
        </div>
        <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{isRunWorkout ? (de ? 'Laufen' : 'Run') : (de ? 'Rad' : 'Bike')}</span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{displayTitle}</h2>
        {/* Explainable prose only — debug-register strings ("Phase: … TSB …")
            never reach the card; the localized purpose is the fallback. */}
        {workoutDisplayRationale(workout, de) && (
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{workoutDisplayRationale(workout, de)}</p>
        )}
      </div>

      {/* Interval profile (Balkendiagramm) — duration-proportional block bars
          with zone colors; micro-interval sets render their on/off stripes.
          Re-renders from the invalidated brief after every "Anpassen". */}
      {wBlocks.length > 0 && (
        <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
          <div className="flex items-center justify-between">
            <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-ink-2)' }}>{de ? 'LEISTUNGSPROFIL' : 'POWER PROFILE'}</span>
            {profile?.ftp_watts != null && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>FTP {profile.ftp_watts}W</span>}
          </div>
          <BlockBars blocks={wBlocks} height={96} />
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-ink-2)' }}>{wBlocks[0]?.name ?? ''}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-ink-2)' }}>{wBlocks[wBlocks.length - 1]?.name ?? ''}</span>
          </div>
        </div>
      )}

      {/* What changed & why — transparent, data-driven adaptation */}
      {adaptations && (adaptations.summary || adaptations.changes.length > 0) && (
        <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
          <button type="button" onClick={() => setWhyOpen((o) => !o)} className="flex items-center gap-2 text-left">
            <Sparkles size={15} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
            <span className="flex-1 min-w-0" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.35 }}>{adaptations.summary}</span>
            {adaptations.changes.length > 0 && <ChevronDown size={16} style={{ color: 'var(--color-muted)', transform: whyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />}
          </button>
          {whyOpen && adaptations.changes.length > 0 && (
            <div className="flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 10 }}>
              {adaptations.changes.map((c, i) => {
                const col = c.severity === 'boost' ? 'var(--color-recovery)' : c.severity === 'ease' ? 'var(--color-amber)' : 'var(--color-strain)'
                return (
                  <div key={i} className="flex gap-2.5">
                    <span className="shrink-0 mt-1" style={{ width: 7, height: 7, borderRadius: 999, background: col }} />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink)' }}>
                        {c.signal}{c.direction === 'up' ? ' ↑' : c.direction === 'down' ? ' ↓' : ''} · <span style={{ color: col, fontWeight: 600 }}>{c.action}</span>
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{c.detail}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.35, fontStyle: 'italic' }}>{c.principle}</span>
                    </div>
                  </div>
                )
              })}
              {(whyInputs.length > 0 || frameworks.length > 0) && (
                <WhyInputChips whyInputs={whyInputs} frameworks={frameworks} de={de} />
              )}
            </div>
          )}
        </div>
      )}

      {/* The identical trio: TSS · duration · zone badge */}
      <div className="flex gap-5">
        {([
          { l: de ? 'ZIEL-TSS' : 'TARGET TSS', v: workout.predicted_tss != null ? `${Math.round(workout.predicted_tss)}` : '—' },
          { l: de ? 'DAUER' : 'DURATION', v: workout.duration_minutes != null ? `${workout.duration_minutes} min` : '—' },
          { l: de ? 'INTENSITÄT' : 'INTENSITY', v: wIntensity ? `${wIntensity.z} · ${wIntensity.t}` : '—' },
        ]).map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{s.l}</span>
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{s.v}</span>
          </div>
        ))}
      </div>
      <div className="hover-reveal">
        <div className="flex flex-col gap-1" style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
          {/* clamp-2 (textfit): the block summary wraps to two lines, never truncates */}
          <span className="line-clamp-2">{wBlockSummary ?? (wIntensity ? `${wIntensity.z} · ${wIntensity.t}` : (de ? 'Intervallprofil' : 'Interval profile'))}</span>
          <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{de ? 'Komplettes Workout →' : 'Full workout →'}</span>
        </div>
      </div>

      {/* "Anpassen" — the real adapt flow, no chat detour. */}
      <AdaptRow de={de} />

      <Link to="/workout/today" className="inline-flex items-center justify-center gap-2 rounded-full py-3.5 min-h-[48px]" style={{ background: 'var(--color-accent)', color: '#0A0C0F', fontSize: 15, fontWeight: 700, boxShadow: '0 6px 18px -4px color-mix(in srgb, var(--color-accent) 55%, transparent)' }}>
        <ListChecks size={18} strokeWidth={2.4} /> {de ? 'Workout ansehen' : 'View full workout'} <ChevronRight size={18} />
      </Link>
    </div>
  )
}

// ── Anpassen sheet + result narration + Rückgängig ───────────────────────────
function AdaptRow({ de }: { de: boolean }) {
  const qc = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [result, setResult] = useState<{ text: string; sub?: string; ok: boolean; undone?: boolean } | null>(null)
  // The ORIGINAL prescribed_workout, snapshotted before the first modify of
  // this session. "Rückgängig" restores it directly from here rather than
  // refetching the brief (which can hang / return null after a plan mutation),
  // so undo is as instant and reliable as apply.
  const originalWorkoutRef = useRef<Record<string, unknown> | null>(null)

  // Week header TSS + strip and the adaptation feed refetch from CHEAP,
  // deterministic endpoints (no LLM) — safe to invalidate eagerly.
  const invalidateWeekAndFeed = () => {
    void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
    void qc.invalidateQueries({ queryKey: PLAN_ADAPTATIONS_KEY })
  }

  const apply = useMutation({
    mutationFn: async (opt: AdaptOption) =>
      (await apiClient.post<ModifyResult>('/workouts/today/modify', {
        modification_type: opt.modification_type,
        ...(opt.duration_min != null ? { duration_min: opt.duration_min } : {}),
      })).data,
    onSuccess: (res) => {
      setSheetOpen(false)
      if (res.success) {
        setResult({
          text: de
            ? `Angepasst — ${res.title ?? ''}${res.duration_min != null ? ` · ${res.duration_min} min` : ''}`.trim()
            : `Adjusted — ${res.title ?? ''}${res.duration_min != null ? ` · ${res.duration_min} min` : ''}`.trim(),
          sub: res.rails_downgraded ? res.reason : undefined,
          ok: true,
        })
        // Snapshot the untouched original once (before the first patch) so
        // "Rückgängig" can restore it without a hanging brief refetch.
        if (originalWorkoutRef.current == null) {
          const cached = qc.getQueriesData({ queryKey: COACH_BRIEF_KEY_ROOT })
            .map(([, d]) => (d as { prescribed_workout?: Record<string, unknown> | null } | undefined)?.prescribed_workout)
            .find((w): w is Record<string, unknown> => w != null)
          if (cached) originalWorkoutRef.current = cached
        }
        // Authoritative, INSTANT patch of the brief cache from the modify
        // response — this is what makes the card visibly adapt on both tabs.
        // We deliberately do NOT invalidate/refetch the coach brief here: the
        // server brief read-path can hang (~2 min) or return a null
        // prescribed_workout immediately after a plan mutation (it busts the
        // cached brief, then blocks on LLM regeneration), which would blank or
        // revert the just-adapted card. The modify response carries the full
        // new session, so the patched cache is correct; the brief re-hydrates
        // naturally on its next scheduled refetch. Week + feed are cheap and
        // refetched so the Train tab strip and adaptation feed stay in sync.
        qc.setQueriesData({ queryKey: COACH_BRIEF_KEY_ROOT }, (old: unknown) =>
          patchBriefWorkoutFromModify(old, res),
        )
        invalidateWeekAndFeed()
      } else {
        setResult({ text: res.reason, ok: false })
      }
    },
    onError: () => {
      setSheetOpen(false)
      setResult({ text: de ? 'Anpassen fehlgeschlagen — versuch es nochmal.' : 'Change failed — try again.', ok: false })
    },
  })

  const undo = useMutation({
    mutationFn: async () => (await apiClient.post<{ success?: boolean; found?: boolean; reason?: string }>('/workouts/today/modify/undo')).data,
    onSuccess: (res) => {
      if (res.success) {
        setResult({ text: de ? 'Rückgängig gemacht — die Original-Einheit steht wieder.' : 'Undone — your original session is back.', ok: true, undone: true })
        // Restore the snapshotted original directly (instant, no brief refetch
        // to hang on). Fall back to a brief invalidation only if we never
        // captured a snapshot (e.g. the page was reloaded between modify+undo).
        const original = originalWorkoutRef.current
        if (original) {
          qc.setQueriesData({ queryKey: COACH_BRIEF_KEY_ROOT }, (old: unknown) => {
            const brief = old as { prescribed_workout?: Record<string, unknown> | null } | undefined
            if (!brief) return old
            return { ...brief, prescribed_workout: original }
          })
          originalWorkoutRef.current = null
        } else {
          void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
        }
        invalidateWeekAndFeed()
      } else {
        setResult({ text: res.reason ?? '', ok: false })
      }
    },
  })

  const busy = apply.isPending || undo.isPending

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => setSheetOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 rounded-full min-h-[44px] px-3"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', opacity: busy ? 0.6 : 1 }}
      >
        <SlidersHorizontal size={15} style={{ color: 'var(--color-ink-2)' }} />
        {busy ? (de ? 'Wird angepasst…' : 'Adjusting…') : (de ? 'Anpassen' : 'Adjust')}
      </button>

      {result?.text && (
        <div className="rounded-[12px] flex items-start gap-2" style={{ background: `color-mix(in srgb, ${result.ok ? 'var(--color-recovery)' : 'var(--color-amber)'} 12%, transparent)`, padding: '9px 11px' }}>
          <Sparkles size={13} style={{ color: result.ok ? 'var(--color-recovery)' : 'var(--color-amber)', flexShrink: 0, marginTop: 2 }} />
          <span className="flex-1 min-w-0 flex flex-col gap-0.5" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
            <span>{result.text}</span>
            {result.sub && <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{result.sub}</span>}
          </span>
          {result.ok && !result.undone && (
            <button type="button" disabled={busy} onClick={() => undo.mutate()} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-accent)', flexShrink: 0, minHeight: 32 }}>
              {de ? 'Rückgängig' : 'Undo'}
            </button>
          )}
        </div>
      )}

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
          <button type="button" aria-label={de ? 'Abbrechen' : 'Cancel'} onClick={() => setSheetOpen(false)} className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} />
          <div className="relative w-full max-w-md rounded-t-[24px] p-5 flex flex-col gap-3" style={{ ...cardStyle, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }} {...GLASS_CARD_MARKER}>
            <div className="flex flex-col gap-0.5">
              <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>{de ? 'Einheit anpassen' : 'Adjust the session'}</span>
              <span style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                {de
                  ? 'Fließt direkt in deinen Plan ein — die Wissenschaft rechnet ab sofort damit. Rückgängig jederzeit.'
                  : 'Written straight into your plan — the science counts on it from now. Undo anytime.'}
              </span>
            </div>
            {ADAPT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                disabled={busy}
                onClick={() => apply.mutate(o)}
                className="flex items-center gap-3 rounded-[16px] p-3.5 text-left"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', opacity: busy ? 0.6 : 1, minHeight: 52 }}
              >
                <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 34, height: 34, background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' }}>
                  {o.modification_type === 'shorten' ? <Clock size={16} style={{ color: 'var(--color-accent)' }} />
                    : o.modification_type === 'harder' ? <Flame size={16} style={{ color: 'var(--color-accent)' }} />
                    : o.modification_type === 'indoor' ? <Home size={16} style={{ color: 'var(--color-accent)' }} />
                    : <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />}
                </span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? o.de : o.en}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{de ? o.deSub : o.enSub}</span>
                </span>
                <ChevronRight size={16} style={{ color: 'var(--color-muted)' }} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="rounded-full"
              style={{ minHeight: 48, fontSize: 14, fontWeight: 700, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }}
            >
              {de ? 'Abbrechen' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── "Why this?" input chips — the coach shows its work ───────────────────────
function WhyInputChips({ whyInputs, frameworks, de }: {
  whyInputs: { l: string; v: string }[]
  frameworks: string[]
  de: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {whyInputs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>
            {de ? 'WAS DER COACH HEUTE GEWOGEN HAT' : 'WHAT THE COACH WEIGHED TODAY'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {whyInputs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-1" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted)' }}>{c.l}</span>
                <span className="num-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>{c.v}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {frameworks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>
            {de ? 'WISSENSCHAFT' : 'SCIENCE'}
          </span>
          {frameworks.map((f, i) => (
            <span key={i} className="rounded-full px-2 py-0.5" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-recovery)', background: 'color-mix(in srgb, var(--color-recovery) 12%, transparent)' }}>
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

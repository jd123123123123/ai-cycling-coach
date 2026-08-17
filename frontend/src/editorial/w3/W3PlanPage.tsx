import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentWeek, WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import { buildPlan, applyPlanChange, type InterviewAnswers } from '../../api/plan'
import { listRehearsals } from '../../api/rehearsal'
import { modifyTodayWorkout, type TodayModificationType } from '../../api/todayModify'
import type { DayPlan } from '../../api/weeks'
import {
  parseISO, addDays, daysBetween, fmtRange, fmtDE, fmtDEShort, weeksDaysLabel, fmtHoursHM,
  planDurSec, isSessionDay, planIF, planTargetWatts, blocksFromIntervals, enduranceEnvelope,
  displayPhase, phaseRail, phaseBlurb, buildWeeklyBars, DE_WD, DE_WD2,
} from './w3plan'
import W3PlanView, {
  type W3PlanVm, type GoalOption, type AdaptKind, type AdaptResult,
  type RebuildPayload, type GoalSwitchPayload,
} from './W3PlanView'

/**
 * W3 · TRAININGSPLAN, wired to the REAL periodization engine. Route /e/w3-plan.
 *
 *  - Mesocycle context, this week's plan + projection: `useCurrentWeek` (the
 *    same source the Train tab reads) — phase, days-to-event, weekly TSS, the
 *    day plans, the session, the race-day projection.
 *  - The 12-week weekly-TSS series: `/plan/build` (`weekly_tss_targets`) — the
 *    idempotent-per-day plan builder is the documented series source; past weeks
 *    overlay the athlete's real ridden TSS (from `useActivitiesRange`).
 *  - Target-event distance/elevation: the parsed target-event route from the
 *    rehearsal store (reuse-only: `listRehearsals` → the `target_event` row).
 *  - Adapt (Easier/Harder/Swap): the REAL persisting `/workouts/today/modify`.
 *  - Plan anpassen / Ziel wechseln: the REAL `/plan/change/apply`.
 *
 * DERIVED (marked): the phase week-ranges + block prose (from the real active
 * phase), and the easier/harder TSS deltas (±15% of the session's real TSS).
 */

const EVENT_NAME: Record<string, string> = {
  race: 'Dein A-Rennen', fondo: 'Dein Gran Fondo', audax: 'Deine Audax', maintenance: 'Grundlage halten',
}

export default function W3PlanPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: week } = useCurrentWeek(0)
  const { data: profile } = useAthleteProfile()
  const seasonStart = useMemo(() => new Date(new Date().getFullYear(), 0, 1), [])
  const { data: seasonActs } = useActivitiesRange(seasonStart, new Date())
  // /plan/build is idempotent per athlete-local day — it returns the existing
  // plan (with its weekly_tss_targets series) without rebuilding. Cached hard so
  // a plan-view open costs at most one request per session.
  const { data: plan } = useQuery({
    queryKey: ['plan', 'build'],
    queryFn: () => buildPlan('onboarding'),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
  // Reuse-only: the parsed target-event route (distance/elevation) if the athlete
  // already rehearsed it — never creates one from the plan view.
  const { data: rehearsals } = useQuery({
    queryKey: ['rehearsals', 'list'],
    queryFn: () => listRehearsals(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const ftp = profile?.ftp_watts ?? null

  const vm = useMemo<W3PlanVm>(() => {
    const today = new Date()
    const goals = profile?.goals ?? null
    const meso = week?.meso_block ?? null

    // ── event identity ──
    const eventDate = profile?.target_event_date ? parseISO(profile.target_event_date) : null
    const eventName = goals?.target_event_name || EVENT_NAME[profile?.target_event_type ?? ''] || 'Kein Ziel gesetzt'
    const targetRe = rehearsals?.find((r) => r.source_kind === 'target_event') ?? null
    const distKm = targetRe ? Math.round(targetRe.distance_m / 1000) : null
    const hm = targetRe ? Math.round(targetRe.ascent_m) : null
    const subParts = [
      eventDate ? fmtDE(eventDate) : null,
      distKm != null ? `${distKm} km` : null,
      hm != null ? `${hm.toLocaleString('de-DE')} hm` : null,
    ].filter(Boolean) as string[]

    // ── timeline ──
    const daysToStart = meso?.days_to_event ?? (eventDate ? Math.max(0, daysBetween(today, eventDate)) : null)
    const targets = plan?.weekly_tss_targets ?? null
    const planStart = plan?.plan_start_date ? parseISO(plan.plan_start_date) : null
    const totalWeeks = targets?.length ?? (daysToStart != null ? Math.max(4, Math.ceil(daysToStart / 7)) : 12)
    const currentIdx = planStart
      ? Math.max(0, Math.min(totalWeeks - 1, Math.floor(daysBetween(planStart, today) / 7)))
      : Math.max(0, totalWeeks - (daysToStart != null ? Math.ceil(daysToStart / 7) : totalWeeks))
    const planWeek = currentIdx + 1

    // ── phase rail (active = real phase; ranges DERIVED) ──
    const active = displayPhase(meso?.phase)
    const phases = phaseRail(totalWeeks, active)
    const activeSegIdx = phases.findIndex((p) => p.active)
    const activeSeg = phases[activeSegIdx] ?? phases[0]
    const [segFrom, segTo] = parseSpan(activeSeg?.weeks ?? 'W1')
    const phaseLen = Math.max(1, segTo - segFrom + 1)
    const weekOfBlock = Math.max(1, Math.min(phaseLen, planWeek - segFrom + 1))

    // ── active block card ──
    const blurb = phaseBlurb(active)
    const blockStart = planStart ? addDays(planStart, (segFrom - 1) * 7) : null
    const blockEnd = planStart ? addDays(planStart, (segTo - 1) * 7 + 6) : null
    const restWeekInBlock = targets
      ? targets.slice(segFrom - 1, segTo).findIndex((t, i, arr) => {
          const g = segFrom - 1 + i
          const prev = targets[g - 1] ?? t
          return t < prev * 0.88 && (arr[i + 1] == null || t <= arr[i + 1] * 0.95)
        })
      : -1
    const nextPhase = phases[activeSegIdx + 1] ?? null
    const nextStart = planStart && nextPhase ? addDays(planStart, (parseSpan(nextPhase.weeks)[0] - 1) * 7) : null
    const nextTail = blurb.next.split('–')[1]?.trim() ?? ''
    const block = meso
      ? {
          phase: active,
          dateRange: blockStart && blockEnd ? fmtRange(blockStart, blockEnd) : '—',
          weekOfBlock: `Woche ${weekOfBlock} von ${phaseLen}`,
          restNote: restWeekInBlock >= 0 ? `Woche ${restWeekInBlock + 1} ist eine Ruhewoche` : null,
          text: blurb.text,
          tags: blurb.tags,
          next: nextPhase
            ? `Danach: ${nextPhase.name}${nextStart ? ` ab ${fmtDEShort(nextStart)}` : ''}${nextTail ? ` – ${nextTail}` : ''}`
            : (eventDate ? `Danach: Renntag am ${fmtDEShort(eventDate)}` : blurb.next),
        }
      : null

    // ── 12-week chart ──
    const acts = seasonActs?.activities ?? []
    const actualByWeek = targets && planStart
      ? targets.map((_, i) => {
          const ws = addDays(planStart, i * 7)
          const we = addDays(ws, 7)
          const sum = acts
            .filter((a) => { const d = new Date(a.started_at); return d >= ws && d < we })
            .reduce((s, a) => s + (a.tss ?? 0), 0)
          return sum > 0 ? sum : null
        })
      : []
    const weekBars = buildWeeklyBars(targets, currentIdx, actualByWeek)
    const avg = targets && targets.length ? Math.round(targets.reduce((s, t) => s + t, 0) / targets.length) : null

    // ── this week ──
    const days = (week?.days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
    const weekStartD = week?.week_start ? parseISO(week.week_start) : null
    const weekEndD = week?.week_end ? parseISO(week.week_end) : null
    const weekSecs = days.reduce((s, d) => s + planDurSec(d), 0)
    const plannedUnits = days.filter(isSessionDay).length
    const thisWeekActs = weekStartD && weekEndD
      ? acts.filter((a) => { const d = new Date(a.started_at); return d >= weekStartD && d < addDays(weekEndD, 1) })
      : []
    const doneUnits = thisWeekActs.length
    const weekHm = thisWeekActs.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0)
    const weekTss = week?.planned_tss_total ?? null

    const dayStrip = buildDayStrip(days, today)

    // ── today's session ──
    const todayPlan = days.find((d) => d.is_today) ?? null
    const hasSession = todayPlan != null && isSessionDay(todayPlan)
    const sTss = hasSession && todayPlan!.target_tss != null ? Math.round(todayPlan!.target_tss) : null
    const sW = hasSession ? planTargetWatts(todayPlan!, ftp) : null
    const sIF = hasSession ? planIF(todayPlan!) : null
    const sSecs = hasSession ? planDurSec(todayPlan!) : 0
    const sBars = hasSession
      ? (todayPlan!.intervals.length > 0 ? blocksFromIntervals(todayPlan!.intervals) : enduranceEnvelope())
      : []
    const easierD = sTss != null ? Math.round(sTss * 0.15) : null
    const harderD = sTss != null ? Math.round(sTss * 0.15) : null

    // ── forecast preview value ──
    const proj = week?.projection ?? null
    const forecastValue = proj?.projected_central != null ? `${Math.round(proj.projected_central)} ${proj.unit || 'W'}` : (proj?.current_estimate != null ? `${Math.round(proj.current_estimate)} ${proj.unit || 'W'}` : '—')

    // ── sheet defaults (real profile) ──
    const da = profile?.days_available ?? null
    const adjustDays: boolean[] = da
      ? [da.mon, da.tue, da.wed, da.thu, da.fri, da.sat, da.sun]
      : [true, true, true, false, true, true, true]
    const adjustHours = profile?.weekly_hours_available ?? plan?.planned_hours ?? 8
    const longDayMap: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }
    const adjustLongDay = da?.long_day ? (longDayMap[da.long_day] ?? 5) : 5

    // ── goal switcher options (real active race + presets) ──
    const goalOptions: GoalOption[] = [
      {
        id: 'race', icon: 'flag', title: 'Rennen',
        meta: profile?.target_event_type ? 'AKTIV' : 'kein Datum',
        desc: eventName !== 'Kein Ziel gesetzt' && eventDate
          ? `${eventName} · ${fmtDEShort(eventDate)} · rückwärts vom Renntag geplant`
          : 'Renntag setzen – Plan rückwärts vom Ziel',
        state: profile?.target_event_type ? 'active' : 'idle', real: true,
      },
      { id: 'vo2', icon: 'gauge', title: 'VO2max-Block', meta: '12 Wochen', desc: 'Zwei harte Einheiten pro Woche · Ziel +6 % an der Spitze', state: 'idle', real: false },
      { id: 'ftp', icon: 'trend', title: 'FTP-Block', meta: '8 Wochen', desc: ftp ? `Schwelle anheben, Volumen halten · Ziel ${ftp} → ${Math.round(ftp * 1.06)} W` : 'Schwelle anheben, Volumen halten', state: 'idle', real: false },
      { id: 'base', icon: 'base', title: 'Grundlage halten', meta: 'offen', desc: 'Kein Datum, nur Konstanz · 3–5 Einheiten pro Woche', state: 'idle', real: true },
    ]

    return {
      eventName,
      eventSub: subParts.join(' · ') || '—',
      daysToStart,
      weeksDaysLabel: daysToStart != null ? weeksDaysLabel(daysToStart) : '—',
      planWeekLabel: `Planwoche ${planWeek} von ${totalWeeks}`,
      phases,
      railProgress: currentIdx / Math.max(1, totalWeeks),
      planWeekNum: planWeek,
      totalWeeks,
      reqSummary: 'Strecke, Anforderungsprofil und Renntag',
      daysRight: daysToStart != null ? `${daysToStart} Tage` : '—',
      phaseOfTotal: `Phase ${activeSegIdx + 1} von ${phases.length}`,
      block,
      avgTss: avg != null ? String(avg) : '—',
      weekBars,
      weekRangeLabel: weekStartD && weekEndD
        ? `${DE_WD2[(weekStartD.getDay() + 6) % 7]} ${weekStartD.getDate()}. – ${DE_WD2[(weekEndD.getDay() + 6) % 7]} ${weekEndD.getDate()}. ${monthDE(weekEndD)} · Woche ${weekOfBlock} im ${active}`
        : '—',
      weekBadge: plannedUnits > 0 ? `${doneUnits} / ${plannedUnits}` : '—',
      weekStats: [
        { value: weekSecs > 0 ? `${fmtHoursHM(weekSecs / 3600)} h` : '—', label: 'Zeit' },
        { value: weekTss != null ? String(Math.round(weekTss)) : '—', label: 'TSS' },
        { value: plannedUnits > 0 ? String(plannedUnits) : '—', label: 'Einheiten' },
        { value: weekHm > 0 ? Math.round(weekHm).toLocaleString('de-DE') : '—', label: 'Höhenmeter' },
      ],
      dayStrip,
      sessionTitle: hasSession ? todayPlan!.title : null,
      sessionDur: sSecs > 0 ? `${Math.floor(sSecs / 3600)}h ${Math.round((sSecs % 3600) / 60)}m` : null,
      targetW: sW != null ? `${sW} W` : '—',
      sessionTss: sTss != null ? String(sTss) : '—',
      ftpPct: sIF != null ? `${Math.round(sIF * 100)}%` : '—',
      ftpTag: ftp != null ? `FTP ${ftp} W` : '',
      sessionBars: sBars,
      easierTss: easierD != null ? `−${easierD} TSS` : '−',
      harderTss: harderD != null ? `+${harderD} TSS` : '+',
      earnNote: sTss != null ? `Diese Einheit bringt RideCoin nach ihrem TSS` : 'RideCoin nach abgeschlossenem TSS',
      forecastValue,
      adaptExplainer:
        'Jede gefahrene Einheit, deine HRV und dein Schlaf fließen jede Nacht zurück in den Plan. Verpasste Tage werden nicht nachgeholt, sondern eingerechnet – der Block bleibt, die Dosis ändert sich. Nur Renntag und Phasenlängen sind fix.',
      adjustDays,
      adjustHours,
      adjustLongDay,
      goalOptions,
    }
  }, [week, profile, plan, rehearsals, seasonActs, ftp])

  // ── real adapt (persists via /workouts/today/modify) ──
  const onAdapt = useCallback(async (kind: AdaptKind): Promise<AdaptResult | null> => {
    if (kind === 'rest') return { title: 'Ruhetag', tss: 0, note: 'Voller Ruhetag – die Last verteilt sich neu.', railsDowngraded: false }
    const modType: TodayModificationType = kind === 'shorter' ? 'shorten' : kind
    const durationMin = kind === 'shorter' ? 45 : undefined
    const res = await modifyTodayWorkout(modType, durationMin)
    if (!res.success) return null
    void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
    void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
    return {
      title: res.title ?? null,
      tss: res.predicted_tss ?? null,
      note: res.title ? `Angepasst – ${res.title}${res.duration_min != null ? ` · ${res.duration_min} min` : ''}` : (res.reason || 'Coach hat die Einheit angepasst.'),
      railsDowngraded: res.rails_downgraded ?? false,
    }
  }, [qc])

  // ── real rebuild (Plan anpassen → /plan/change/apply) ──
  const onRebuild = useCallback(async (p: RebuildPayload): Promise<boolean> => {
    const [mon, tue, wed, thu, fri, sat, sun] = p.days
    const longKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
    const answers: InterviewAnswers = {
      weekly_hours: p.weekly_hours,
      days_available: { mon, tue, wed, thu, fri, sat, sun, long_day: longKeys[p.longDay] },
    }
    try {
      await applyPlanChange(answers)
      void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      void qc.invalidateQueries({ queryKey: ['plan', 'build'] })
      void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
      // The dialog seeds its hours slider from `profile.weekly_hours_available`
      // (see `adjustHours` above), and the server writes the new value onto the
      // profile. Without this the athlete changed 12 h to 6 h, saved, reopened
      // "Plan anpassen" and was shown 12 again — the change HAD been applied,
      // the form was just reading a stale cache. `onSwitchGoal` below always
      // invalidated this key; this handler didn't.
      void qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      return true
    } catch { return false }
  }, [qc])

  // ── real goal switch (Ziel wechseln → /plan/change/apply) ──
  const onSwitchGoal = useCallback(async (_id: string, p: GoalSwitchPayload): Promise<boolean> => {
    const answers: InterviewAnswers = { goal_changed: p.goal_changed, ...(p.goal_new ? { goal_new: p.goal_new } : {}) }
    try {
      await applyPlanChange(answers)
      void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      void qc.invalidateQueries({ queryKey: ['plan', 'build'] })
      void qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      return true
    } catch { return false }
  }, [qc])

  return (
    <W3PlanView
      vm={vm}
      onBack={() => navigate(-1)}
      onGoal={() => navigate('/e/w3-goal')}
      onLoad={() => navigate('/e/w3-load')}
      onStartRide={() => navigate('/e/w3-session')}
      onAdapt={onAdapt}
      onRebuild={onRebuild}
      onSwitchGoal={onSwitchGoal}
    />
  )
}

// ── local helpers ──
function parseSpan(weeks: string): [number, number] {
  // "W4–7" | "W5" → [4,7] | [5,5]
  const m = weeks.replace('W', '').split('–').map((x) => parseInt(x, 10))
  const from = m[0] || 1
  const to = m[1] || from
  return [from, to]
}
function monthDE(d: Date): string {
  return ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][d.getMonth()]
}
function buildDayStrip(days: DayPlan[], today: Date) {
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return days.slice(0, 7).map((d) => {
    const dt = parseISO(d.date)
    const idx = (dt.getDay() + 6) % 7
    return {
      letter: DE_WD[idx],
      date: String(dt.getDate()),
      frac: d.target_tss ?? (planDurSec(d) / 3600) * 40,
      isToday: d.date.slice(0, 10) === todayIso,
      isRest: d.category === 'rest',
    }
  })
}

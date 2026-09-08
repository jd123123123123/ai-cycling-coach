import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentWeek, WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import { buildPlan, applyPlanChange, type InterviewAnswers } from '../../api/plan'
import { listRehearsals, getRehearsal } from '../../api/rehearsal'
import { modifyTodayWorkout, undoTodayModify, type TodayModificationType } from '../../api/todayModify'
import type { DayPlan } from '../../api/weeks'
import {
  parseISO, addDays, daysBetween, fmtRange, fmtDE, fmtDEShort, weeksDaysLabel, fmtHoursHM,
  planDurSec, isSessionDay, planIF, planTargetWatts, blocksFromIntervals, enduranceEnvelope,
  displayPhase, phaseRail, phaseBlurb, buildWeeklyBars, DE_WD, DE_WD2,
} from './w3plan'
import { hasPlanFromWeek } from './w3hasPlan'
import { useStreak } from '../../hooks/useStreak'
import { forecastRideRc, streakMultiplier, formatMultiplier } from '../../api/rewards'
import W3Loading from './W3Loading'
import W3LoadError from './W3LoadError'
import W3PlanEmptyView, { type W3PlanEmptyVm } from './W3PlanEmptyView'
import { useHeroPanel } from './W3HeroShell'
import W3PlanView, {
  type W3PlanVm, type GoalOption, type AdaptKind, type AdaptResult,
  type RebuildPayload, type GoalSwitchPayload, type PlanDaySession,
} from './W3PlanView'
import { DASH } from './w3tokens'
// THE DOCK, in the idiom Today and Fahrten share. The plan used to open on a
// flat three-stat row while the other two bottom tabs opened on one big number
// and its meter — so the plan was the odd screen out on the first thing a
// rider sees. Its own big number is the countdown, and its meter is the
// periodisation: Grundlage · Aufbau · Spezifisch · Taper.
import W3PlanDock from './W3PlanDock'

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
  const { data: week, isLoading: weekLoading, isError: weekError, refetch: refetchWeek, isFetching: weekFetching } = useCurrentWeek(0)
  const { data: profile } = useAthleteProfile()
  const { data: streak } = useStreak()
  const seasonStart = useMemo(() => new Date(new Date().getFullYear(), 0, 1), [])
  const { data: seasonActs } = useActivitiesRange(seasonStart, new Date())
  // /plan/build is idempotent per athlete-local day — it returns the existing
  // plan (with its weekly_tss_targets series) without rebuilding. Cached hard so
  // a plan-view open costs at most one request per session.
  // A PLAN IS NOT BUILT BY LOOKING AT THE PLAN SCREEN. `/plan/build` is
  // idempotent for an athlete who HAS a plan — it hands back the existing one —
  // but for an athlete who has none it is a constructor, and firing it on mount
  // would give every visitor a plan they never asked for and delete the empty
  // state by visiting it. Gated on the same rule the render branches on.
  const hasPlan = hasPlanFromWeek(week)
  // A PLAN AND A GOAL ARE DIFFERENT THINGS, and only the PLAN decides which
  // shape this route takes. `w3hasPlan` exists precisely so Today and this page
  // cannot disagree about that — "two screens deciding the same thing from two
  // different derivations is a bug waiting for the one athlete they disagree
  // about". Swapping in the empty page on a missing GOAL made this that bug:
  // a rider with real prescribed days saw a full week on Today and "NOCH KEIN
  // PLAN" here, on the same morning.
  //
  // The goal is still missing, and it is still worth asking for — the DOCK does
  // that (`W3PlanDock` drops the countdown and the periodisation when there is
  // no dated event and asks for one instead, deriving it from `daysToStart` so
  // there is no second source for that either). Asking is not the same as
  // pretending the training does not exist.
  const { data: plan } = useQuery({
    queryKey: ['plan', 'build'],
    queryFn: () => buildPlan('onboarding'),
    enabled: hasPlan,
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

  // The target event's PARSED COURSE — climbs with length and gradient. The
  // list payload carries only distance and ascent, so the plan asks for the
  // one row it needs, and only when that row exists. Cached hard: a course
  // does not change between opens.
  const targetRehearsalId = rehearsals?.find((r) => r.source_kind === 'target_event')?.id ?? null
  const { data: targetCourse } = useQuery({
    queryKey: ['rehearsal', targetRehearsalId],
    queryFn: () => getRehearsal(targetRehearsalId as number),
    enabled: targetRehearsalId != null,
    staleTime: 60 * 60 * 1000,
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
          // The real fraction behind the meter. It used to animate to a
          // hardcoded '50%'/'66%' directly under this honest label.
          weekOfBlockPct: Math.round((weekOfBlock / phaseLen) * 100),
          restNote: restWeekInBlock >= 0 ? `Woche ${restWeekInBlock + 1} ist eine Ruhewoche` : null,
          // ── THE MOUNTAIN THIS BLOCK IS FOR ──────────────────────────
          // Every engine in the category plans toward a DATE; the course's
          // own longest climb is the demand the block actually answers, and
          // it is sitting parsed in the rehearsal store. Real numbers, and
          // the answer keyed to the REAL active phase — or nothing at all.
          terrainNote: (() => {
            const big = [...(targetCourse?.climbs ?? [])]
              .sort((a, b) => b.elev_gain_m - a.elev_gain_m)[0]
            if (!big || big.length_m < 1500) return null
            const km = (big.length_m / 1000).toFixed(1)
            const pct = big.avg_grade_pct.toFixed(1)
            const answer = active === 'Spezifisch'
              ? 'Genau dafür sind die langen Schwellenblöcke hier.'
              : active === 'Aufbau'
                ? 'Dieser Block baut die Grundlage, die den Anstieg trägt.'
                : active === 'Taper'
                  ? 'Jetzt nur noch frisch werden — die Arbeit dafür ist gemacht.'
                  : 'Die Grundlage dafür entsteht in diesem Block.'
            return `Dein Ziel verlangt ${km} km am Stück bei ${pct} %. ${answer}`
          })(),
          text: blurb.text,
          tags: blurb.tags,
          next: nextPhase
            ? `Danach: ${nextPhase.name}${nextStart ? ` ab ${fmtDEShort(nextStart)}` : ''}${nextTail ? ` – ${nextTail}` : ''}`
            : (eventDate ? `Danach: Renntag am ${fmtDEShort(eventDate)}` : blurb.next),
        }
      : null

    // ── 12-week chart ──
    // Cycling only, like the empty page's ledger already did: this is a BIKE
    // plan, and a run incrementing the "3 / 5" completion badge or a swim
    // shading a week's bar counted effort the plan never asked for.
    const acts = (seasonActs?.activities ?? []).filter((a) => a.sport === 'cycling')
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

    const dayStrip = buildDayStrip(days, today).map((c, i) => ({
      ...c,
      // A ✓ is a claim about a ride — same rule as "GEFAHREN" above.
      ridden: acts.some((a) => a.started_at.slice(0, 10) === days[i]?.date),
    }))

    // ── every day's session, not just today's ──
    // The strip used to be a read-only chart beside a card that could only ever
    // describe TODAY, so the one question a plan screen exists to answer —
    // "what is coming, and how hard" — needed a different screen. `days` is the
    // whole /weeks/current week, so each day can carry its own session and the
    // strip can drive which one is shown.
    const daySessions: PlanDaySession[] = days.map((d) => {
      const isSess = isSessionDay(d)
      const tss = isSess && d.target_tss != null ? Math.round(d.target_tss) : null
      const secs = isSess ? planDurSec(d) : 0
      const iff = isSess ? planIF(d) : null
      const w = isSess ? planTargetWatts(d, ftp) : null
      const dt = parseISO(d.date)
      return {
        title: isSess ? (d.title ?? 'Einheit') : null,
        weekday: dt ? DE_WD[(dt.getDay() + 6) % 7] : '',
        dateLabel: dt ? fmtDEShort(dt) : '',
        isToday: !!d.is_today,
        isPast: !!dt && !d.is_today && dt < today,
        // "GEFAHREN" is a claim about a ride, not about the calendar — checked
        // against the rider's actual activities, never asserted from `isPast`.
        ridden: acts.some((a) => a.started_at.slice(0, 10) === d.date),
        // The server's own per-day WHY — fetched all along, rendered nowhere.
        rationale: isSess && d.rationale ? d.rationale : null,
        dateISO: d.date,
        dur: secs > 0 ? `${Math.floor(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m` : null,
        tss: tss != null ? String(tss) : DASH,
        targetW: w != null ? `${w} W` : DASH,
        ftpPct: iff != null ? `${Math.round(iff * 100)}%` : DASH,
        bars: isSess
          ? (d.intervals.length > 0 ? blocksFromIntervals(d.intervals) : enduranceEnvelope())
          : [],
      }
    })

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
      // The VO2max/FTP "block" presets are gone: they were previews wearing a
      // submit button — every non-race option posts goal_changed:'no_event',
      // which DELETES the race date server-side (plan_interview.py). Two real
      // destinations remain; a fake option with a real irreversible side
      // effect is the worst trade the sheet can offer.
      { id: 'base', icon: 'base', title: 'Grundlage halten', meta: 'offen', desc: 'Kein Datum, nur Konstanz · 3–5 Einheiten pro Woche', state: profile?.target_event_type ? 'idle' : 'active', real: true },
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
      // ── WHAT THE COURSE ACTUALLY ASKS FOR ────────────────────────────
      // This was the hardcoded string 'Strecke, Anforderungsprofil und
      // Renntag' on a screen whose contract is "structural numbers resolve or
      // dash" — and it was the plan's only place to say that the event has
      // TERRAIN, not just a date. The rehearsal store already parsed the
      // course: its climbs carry length and average gradient. The longest one
      // is the demand the block is training for, so it is the one named.
      reqSummary: (() => {
        if (!targetRe) return 'Lade die Strecke hoch — dann steht hier, was sie verlangt'
        const parts: string[] = []
        if (distKm != null) parts.push(`${distKm} km`)
        if (hm != null) parts.push(`${hm.toLocaleString('de-DE')} hm`)
        const big = [...(targetCourse?.climbs ?? [])].sort((a, b) => b.elev_gain_m - a.elev_gain_m)[0]
        if (big && big.length_m >= 1000) {
          parts.push(`längster Anstieg ${(big.length_m / 1000).toFixed(1)} km à ${big.avg_grade_pct.toFixed(1)} %`)
        }
        return parts.length > 0 ? parts.join(' · ') : 'Strecke gespeichert — Anforderungen folgen'
      })(),
      daysRight: daysToStart != null ? `${daysToStart} Tage` : '—',
      phaseOfTotal: `Phase ${activeSegIdx + 1} von ${phases.length}`,
      block,
      avgTss: avg != null ? String(avg) : '—',
      weekBars,
      weekRangeLabel: weekStartD && weekEndD
        ? `${DE_WD2[(weekStartD.getDay() + 6) % 7]} ${weekStartD.getDate()}. – ${DE_WD2[(weekEndD.getDay() + 6) % 7]} ${weekEndD.getDate()}. ${monthDE(weekEndD)} · Woche ${weekOfBlock} im ${active}`
        : '—',
      weekBadge: plannedUnits > 0 ? `${doneUnits} / ${plannedUnits}` : '—',
      // ── THE MIRROR IS ALLOWED TO SMILE ───────────────────────────────
      // Every readiness and plan surface in this app speaks when something is
      // below baseline and stays silent when everything is right, so a rider
      // who does the work hears nothing back. This is the positive branch,
      // and it is a FACT rather than praise: the sessions planned for the
      // days that have already passed are all ridden.
      weekPraise: (() => {
        if (plannedUnits === 0) return null
        const passed = days.filter((d) => {
          const dt = parseISO(d.date)
          return isSessionDay(d) && dt != null && !d.is_today && dt < today
        })
        if (passed.length < 2) return null
        const ridden = passed.filter((d) => acts.some((a) => a.started_at.slice(0, 10) === d.date))
        if (ridden.length !== passed.length) return null
        return doneUnits >= plannedUnits
          ? 'Diese Woche steht komplett. Jede geplante Einheit gefahren.'
          : `${ridden.length} von ${ridden.length} bisher geplanten Einheiten gefahren — die Woche läuft sauber.`
      })(),
      weekStats: [
        { value: weekSecs > 0 ? `${fmtHoursHM(weekSecs / 3600)} h` : '—', label: 'Zeit' },
        { value: weekTss != null ? String(Math.round(weekTss)) : '—', label: 'TSS' },
        { value: plannedUnits > 0 ? String(plannedUnits) : '—', label: 'Einheiten' },
        { value: weekHm > 0 ? Math.round(weekHm).toLocaleString('de-DE') : '—', label: 'Höhenmeter' },
      ],
      dayStrip,
      daySessions,
      // ── the server's own WHY, finally rendered ──────────────────────────
      // `preface` is the built weekly rationale; the notes are the coach's own
      // localized sentences about what changed and what the body says. All of
      // this arrived in /weeks/current on every load and was discarded.
      weekWhy: week?.preface || null,
      planNotes: [
        week?.plan_changes?.message || null,
        week?.readiness?.reason || null,
        week?.missed_yesterday
          ? `Gestern nicht gefahren: ${week.missed_yesterday.title_de ?? week.missed_yesterday.title} — eingerechnet, kein Nachholen.`
          : null,
      ].filter((x): x is string => !!x),
      sessionTitle: hasSession ? todayPlan!.title : null,
      sessionDur: sSecs > 0 ? `${Math.floor(sSecs / 3600)}h ${Math.round((sSecs % 3600) / 60)}m` : null,
      targetW: sW != null ? `${sW} W` : '—',
      sessionTss: sTss != null ? String(sTss) : '—',
      ftpPct: sIF != null ? `${Math.round(sIF * 100)}%` : '—',
      ftpTag: ftp != null ? `FTP ${ftp} W` : '',
      sessionBars: sBars,
      easierTss: easierD != null ? `−${easierD} TSS` : '−',
      harderTss: harderD != null ? `+${harderD} TSS` : '+',
      // A reward without a number is a shrug: the same forecast Today's card
      // shows, from the one ported earn ladder (api/rewards ← rewards.py).
      earnNote: (() => {
        const rc = forecastRideRc(sTss, streak?.streak ?? null)
        if (rc == null) return 'RideCoin nach abgeschlossenem TSS'
        const mult = streakMultiplier(streak?.streak ?? 0)
        return mult > 1
          ? `Bringt ca. ${rc.toLocaleString('de-DE')} RC · ${formatMultiplier(mult)} Streak`
          : `Bringt ca. ${rc.toLocaleString('de-DE')} RC`
      })(),
      forecastValue,
      adaptExplainer:
        'Jede gefahrene Einheit, deine HRV und dein Schlaf fließen jede Nacht zurück in den Plan. Verpasste Tage werden nicht nachgeholt, sondern eingerechnet – der Block bleibt, die Dosis ändert sich. Nur Renntag und Phasenlängen sind fix.',
      adjustDays,
      adjustHours,
      adjustLongDay,
      goalOptions,
    }
  }, [week, profile, plan, rehearsals, targetCourse, seasonActs, ftp, streak])

  // ── real adapt (persists via /workouts/today/modify) ──
  const onAdapt = useCallback(async (kind: AdaptKind): Promise<AdaptResult | null> => {
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

  // The revert half of the adapt row — same invalidations, same source of
  // truth. `undoTodayModify` sat in the API layer with no W3 caller, which
  // made every adapt one-way.
  const onUndoAdapt = useCallback(async (): Promise<boolean> => {
    try {
      const res = await undoTodayModify()
      const ok = !!res.success
      if (ok) {
        void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
        void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
      }
      return ok
    } catch { return false }
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

  // The rider's own season, which is the only argument the empty page makes.
  const emptyVm = useMemo<W3PlanEmptyVm>(() => {
    const cyc = (seasonActs?.activities ?? []).filter((a) => a.sport === 'cycling')
    const secs = cyc.reduce((s, a) => s + (a.duration_seconds ?? 0), 0)
    const tss = cyc.reduce((s, a) => s + (a.tss ?? 0), 0)
    return {
      rides: cyc.length > 0 ? cyc.length : null,
      hours: secs > 0 ? Math.round(secs / 3600) : null,
      tss: tss > 0 ? Math.round(tss) : null,
      since: `seit ${fmtDE(seasonStart).replace(/^\w+,\s*/, '')}`,
    }
  }, [seasonActs, seasonStart])

  // IN THE ROOM, the machine is the hero and the plan's three figures dock
  // under it; the page below carries the rest. `inShell` is false on the
  // preview route and on a deep link that skips the shell, and there the view
  // keeps drawing its own status bar and header exactly as before — a page
  // outside the room is a legitimate thing to be.
  //
  // ABOVE THE EMPTY-PLAN RETURN, because it is a hook. Called below it, the
  // hook order changes the moment a rider has no plan — React's rule, and a
  // real bug rather than a lint nag: the empty state and the built state would
  // disagree about how many hooks this component runs.
  const { inShell, portal } = useHeroPanel((
    <W3PlanDock
      vm={{
        daysToStart: vm.daysToStart,
        eventName: vm.eventName,
        planWeekNum: vm.planWeekNum,
        totalWeeks: vm.totalWeeks,
        phases: vm.phases,
        blockName: vm.block?.phase ?? null,
      }}
      onOpen={() => navigate('/e/w3-goal-set')} />
  ))

  // "YOU HAVE NO PLAN" IS A CLAIM, and it needs the read to have landed.
  // `hasPlanFromWeek(undefined)` is false, so the empty page used to render on
  // every load — and permanently on a 401/403/404/409, where the query does not
  // retry. A rider with a live 12-week plan was told "NOCH KEIN PLAN" and
  // offered onboarding.
  if (weekLoading && !week) {
    return <W3Loading label="Dein Plan lädt…" />
  }
  if (weekError && !week) {
    return (
      <W3LoadError
        title="Dein Plan lädt nicht"
        detail="Wir konnten deine Woche gerade nicht abrufen. Am Plan ändert das nichts — das ist nur die Verbindung."
        onRetry={() => void refetchWeek()}
        retrying={weekFetching}
      />
    )
  }

  if (!hasPlan) {
    return (
      <>
      {portal}
      <W3PlanEmptyView
        vm={emptyVm}
        chromeless={inShell}
        onBack={() => navigate(-1)}
        onStart={(key) => navigate(`/e/w3-goal-set?intent=${key}`)}
        onBuilder={() => navigate('/workouts/builder')}
        onImport={() => navigate('/plan/import')}
      />
      </>
    )
  }

  return (
    <>
    {portal}
    <W3PlanView
      vm={vm}
      chromeless={inShell}
      onBack={() => navigate(-1)}
      onGoal={() => navigate('/e/w3-goal')}
      onLoad={() => navigate('/e/w3-load')}
      onStartRide={() => navigate('/e/w3-session')}
      onAdapt={onAdapt}
      onRebuild={onRebuild}
      onSwitchGoal={onSwitchGoal}
      onUndoAdapt={onUndoAdapt}
      onOpenSession={(iso) => navigate(`/e/w3-session/${iso}`)}
    />
    </>
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

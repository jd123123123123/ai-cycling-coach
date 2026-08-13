import { useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useTodayModel } from '../data/useTodayModel'
import { useDayState } from '../state/useDayState'
import { useStreak } from '../../hooks/useStreak'
import { useCrewStandings } from '../../hooks/useCrew'
import { useAdaptive } from '../../hooks/useAdaptive'
import { useCurrentWeek, WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { isPresent, type Value } from '../data/value'
import { modifyTodayWorkout, type TodayModificationType } from '../../api/todayModify'
import type { DayPlan, IntervalBlockOut } from '../../api/weeks'
import { hasSeenW3Onboarding } from './w3Onboarding'
import W3TodayView, { type W3Vm, type W3Signal, type W3Spark, type W3Block, type OnAdapt } from './W3TodayView'

type SignalValue = { value: number; delta: number | null }

/**
 * W3 · 01 TODAY, wired to live data. Route: /e/w3-today.
 *
 * Reuses the exact plumbing `pages/TodayPage.tsx` uses — `useDayState()` +
 * `useTodayModel(state)` for the coaching model and `useAuth()` for the real
 * avatar/handle. The layout is `W3TodayView`, a pure function of `vm`.
 *
 * Honesty contract (mirrors the rest of the editorial system): the real
 * coaching metrics — readiness, HRV/RHR/sleep, the week strip, the session,
 * fitness/fatigue/form — resolve to a value or `null` (the View renders "—").
 * The reward-economy layer (earn rate, Power/Cycle balances, the Garage
 * upgrade, the crew standings) has no backend yet, so those fields are DESIGN
 * FIXTURES reproducing the pen; each is marked `fixture:` below and is the
 * seam the `2026-08-11-garage-composable-figures` spec will wire.
 */

/** Build a 7-bar spark from a series, normalised to its own max, last = today. */
function sparkFrom(series: number[] | null, hi: string): W3Spark {
  if (!series || series.length === 0) return { bars: [0.3, 0.5, 0.4, 0.7, 0.55, 0.8, 1], hi } // fixture shape when no series
  const tail = series.slice(-7)
  const max = Math.max(...tail, 1)
  return { bars: tail.map((v) => v / max), hi }
}

// ── Real per-day session math (mirrors PlanTab's interval→bar + Ø-watts logic
//    so the W3 card reads the SAME real plan the Train tab does) ──────────────

/** A day's prescribed seconds — the explicit target, else the sum of its blocks
 *  (LLM personalization can null the target while keeping the interval shape). */
function planDurSec(p: DayPlan): number {
  return p.duration_seconds_target ?? ((p.intervals ?? []).reduce((s, iv) => s + (iv.duration_seconds ?? 0), 0))
}
/** A day is a real session when it carries ANY prescribed content (content-based,
 *  so it survives category/duration re-shaping). A rest-category day is rest. */
function isSessionDay(p: DayPlan): boolean {
  return p.category !== 'rest' && (planDurSec(p) > 0 || (p.intervals?.length ?? 0) > 0 || (p.target_tss ?? 0) > 0)
}
/** Intensity factor from planned TSS + duration (the Coggan relation), or null. */
function planIF(p: DayPlan): number | null {
  const dur = planDurSec(p)
  return p.target_tss != null && p.target_tss > 0 && dur > 0
    ? Math.sqrt(p.target_tss / ((dur / 3600) * 100))
    : null
}
/** Effective %FTP·seconds of one block, honoring structured on/off sets (a
 *  "30×15/45s" set is reps×on @ on-power + reps×off @ off-power, not 30 min at
 *  on-power) — PlanTab's blockPctSeconds. */
function blockPctSeconds(iv: IntervalBlockOut): { pctSeconds: number; seconds: number } {
  const onPct = iv.power_target_pct_ftp ?? 0
  if (iv.reps && iv.on_s && iv.on_s > 0) {
    const offPct = iv.off_pct_ftp ?? 0
    const offS = iv.off_s ?? 0
    const onSeconds = iv.reps * iv.on_s
    const offSeconds = iv.reps * offS
    return { pctSeconds: onSeconds * onPct + offSeconds * offPct, seconds: onSeconds + offSeconds }
  }
  return { pctSeconds: iv.duration_seconds * onPct, seconds: iv.duration_seconds }
}
/** Duration-weighted session-average watts from a day's intervals (PlanTab's
 *  cyclingAvgWatts). Null without FTP or any powered block. */
function cyclingAvgWatts(ivs: IntervalBlockOut[], ftp: number | null): number | null {
  if (ftp == null) return null
  const powered = ivs.filter((iv) => (iv.power_target_pct_ftp ?? 0) > 0 && iv.duration_seconds > 0)
  const tot = powered.reduce((s, iv) => s + iv.duration_seconds, 0)
  if (tot <= 0) return null
  const pctSeconds = powered.reduce((s, iv) => s + blockPctSeconds(iv).pctSeconds, 0)
  return Math.round((pctSeconds / tot) * ftp)
}
/** A day's representative target watts: Ø watts when the intervals carry power,
 *  else derived from IF × FTP, else null ("—"). */
function planTargetWatts(p: DayPlan, ftp: number | null): number | null {
  const avg = cyclingAvgWatts(p.intervals ?? [], ftp)
  if (avg != null) return avg
  const ifac = planIF(p)
  return ifac != null && ftp != null ? Math.round(ifac * ftp) : null
}
/** One block's bar height, from %FTP (capped at 125%) or, absent power, its zone
 *  (PlanTab's ivFrac). */
function ivFrac(iv: IntervalBlockOut): number {
  return iv.power_target_pct_ftp ? Math.min(1, iv.power_target_pct_ftp / 1.25) : Math.min(1, iv.zone / 7)
}
/** Real interval blocks → the card's power-profile bars. Structured on/off sets
 *  expand into alternating work/recover bars (rep count capped so the profile
 *  stays legible on a 390px card); work = zone ≥ 3. Watts come from
 *  target_watts_high, else %FTP × FTP; the exact rep count lives in the label. */
function blocksFromIntervals(ivs: IntervalBlockOut[], ftp: number | null): W3Block[] {
  const REP_CAP = 6
  const wattsOf = (pct: number | null | undefined, hi: number | null | undefined): number | null =>
    hi != null && hi > 0 ? hi : (pct != null && pct > 0 && ftp != null ? Math.round(pct * ftp) : null)
  const bars: W3Block[] = []
  for (const iv of ivs) {
    const work = iv.zone >= 3
    const onW = wattsOf(iv.power_target_pct_ftp, iv.target_watts_high)
    const wLabel = onW != null ? `${onW} W` : `Z${iv.zone}`
    if (iv.reps && iv.reps > 1 && iv.on_s && iv.on_s > 0) {
      const n = Math.min(iv.reps, REP_CAP)
      const offFrac = iv.off_pct_ftp ? Math.min(1, iv.off_pct_ftp / 1.25) : 0.22
      const offW = wattsOf(iv.off_pct_ftp, null)
      const onS = iv.on_s
      const onLabel = `${iv.reps}×${onS % 60 === 0 ? `${onS / 60} min` : `${onS}s`} · ${wLabel}`
      const offLabel = offW != null ? `Recover · ${offW} W` : 'Recover'
      for (let r = 0; r < n; r++) {
        bars.push({ w: ivFrac(iv), work, label: onLabel })
        bars.push({ w: offFrac, work: false, label: offLabel })
      }
    } else {
      const mins = Math.round(iv.duration_seconds / 60)
      bars.push({ w: ivFrac(iv), work, label: mins > 0 ? `${mins} min · ${wLabel}` : wLabel })
    }
  }
  return bars
}

export default function W3TodayPage() {
  const { state } = useDayState()
  const model = useTodayModel(state)
  const { user } = useAuth()
  const { data: streak } = useStreak()
  const { data: standings } = useCrewStandings('week')
  const { data: adaptive } = useAdaptive()
  // The REAL week-ahead plan (today + next 6 days) — the same source the Train
  // tab reads. Each DayPlan carries its title / target_tss / category / interval
  // blocks, so every day in the strip (not just today) gets its real session.
  const { data: week } = useCurrentWeek(0)
  const { data: profile } = useAthleteProfile()
  const qc = useQueryClient()
  const ftp = profile?.ftp_watts ?? null

  const vm = useMemo<W3Vm>(() => {
    // Real crew standings (top 3 by weekly score, you highlighted). Each bar is
    // the member's share of the crew's leader; honest fallback to the fixture
    // only when the athlete is in no crew / standings haven't loaded.
    const CREW_COLORS = ['#7B5CFF', '#6B8CFF', '#EEC7A7', '#A7D8EE']
    const rows = standings?.standings ?? []
    let realCrew: { name: string; color: string; pct: number; me: boolean }[] | null = null
    let realCrewCaption: string | null = null
    let realCrewRank: string | null = null
    if (rows.length > 0) {
      const top = Math.max(...rows.map((r) => r.weekly_score), 1)
      const ranked = [...rows].sort((a, b) => b.weekly_score - a.weekly_score)
      realCrew = ranked.slice(0, 3).map((r, i) => ({
        name: r.is_you ? 'You' : `@${r.handle}`,
        color: r.is_you ? '#2BE68F' : CREW_COLORS[i % CREW_COLORS.length],
        pct: Math.round((r.weekly_score / top) * 100),
        me: r.is_you,
      }))
      const myIdx = ranked.findIndex((r) => r.is_you)
      if (myIdx >= 0) realCrewRank = `#${myIdx + 1}`
      const me = rows.find((r) => r.is_you)
      if (me) realCrewCaption = `You've banked ${Math.round(me.weekly_tss)} TSS with your crew this week.`
    }

    // Readiness for the hero: the model withholds its score when the overnight
    // wearable read is stale (the "date the measurement" rule). But the coach's
    // adaptive engine still computes a live readiness (daily_decision.readiness)
    // from the freshest HRV/TSB it has — so fall back to that rather than show an
    // empty hero. Keeps the big number honest AND populated.
    const modelReadiness = isPresent(model.readiness) ? model.readiness.value.score : null
    const readiness = modelReadiness ?? adaptive?.daily_decision?.readiness?.score ?? null
    const verdict = isPresent(model.verdict) ? model.verdict.value : null

    const sig = (
      v: Value<SignalValue>,
      unit: string,
      fmt: (x: number) => string,
      hi: string,
    ): W3Signal | null => {
      if (!isPresent(v)) return null
      const { value, delta } = v.value
      const sub = delta == null ? null : `${delta > 0 ? '+' : ''}${delta} vs baseline`
      return { value: fmt(value), unit, sub, subHue: '#C8FF00', spark: sparkFrom(null, hi) }
    }

    const hrv = sig(model.hrv, 'ms', (x) => String(Math.round(x)), '#00E5FF')
    const rhr = sig(model.restingHr, 'bpm', (x) => String(Math.round(x)), '#C8FF00')
    const sleep: W3Signal | null = isPresent(model.sleep)
      ? (() => {
          const s = model.sleep.value
          const hrs = Math.floor(s.totalS / 3600)
          const mins = Math.round((s.totalS % 3600) / 60)
          return { value: `${hrs}:${String(mins).padStart(2, '0')}`, unit: 'hrs', sub: null, subHue: '#C8FF00', spark: sparkFrom(null, '#ED29FF') }
        })()
      : null

    const weekMeta = isPresent(model.weekLoad)
      ? `${model.weekLoad.value.spent} of ${model.weekLoad.value.planned} TSS`
      : '—'

    // The real week-ahead plan, indexed by ISO date so each strip day can look
    // up its own DayPlan (title / TSS / category / intervals).
    const planByDate = new Map<string, DayPlan>()
    for (const dp of week?.days ?? []) planByDate.set(dp.date.slice(0, 10), dp)
    const todayPlan = (week?.days ?? []).find((d) => d.is_today) ?? null
    const todayPlanSession = todayPlan != null && isSessionDay(todayPlan)

    // Today's session: prefer the REAL /weeks plan (title + TSS + intervals),
    // else the model's, else the coach's daily-decision prescription (title +
    // TSS + duration are real; intensity via the Coggan relation). Watts come
    // from the real intervals × FTP, honest "—" without an FTP anchor.
    const modelSession = isPresent(model.session) ? model.session.value : null
    const planned = adaptive?.daily_decision?.planned ?? null
    const planSession = todayPlan && todayPlanSession
      ? {
          title: todayPlan.title,
          targetWatts: planTargetWatts(todayPlan, ftp),
          tss: todayPlan.target_tss != null ? Math.round(todayPlan.target_tss) : null,
          intensityFactor: planIF(todayPlan),
          blocks: [] as { label: string; minutes: number; watts: number | null }[],
        }
      : null
    const session = planSession ?? modelSession ?? (planned?.title
      ? {
          title: planned.title,
          targetWatts: null as number | null,
          tss: planned.target_tss != null ? Math.round(planned.target_tss) : null,
          intensityFactor: planned.target_tss && planned.duration_minutes
            ? Math.sqrt(planned.target_tss / ((planned.duration_minutes / 60) * 100))
            : null,
          blocks: [] as { label: string; minutes: number; watts: number | null }[],
        }
      : null)
    // Build the workout power profile. A structured session (intervals) uses its
    // real blocks. A steady endurance ride materialises to 1–2 blocks, which
    // reads as a single flat beam — so render its true shape instead: a warm-up
    // ramp, a long steady body at the prescribed intensity, and a cool-down.
    const realBlocks = session
      ? session.blocks.map((b) => ({
          w: b.watts && session.targetWatts ? Math.min(1, b.watts / (session.targetWatts * 1.1)) : 0.28,
          work: (b.watts ?? 0) >= (session.targetWatts ?? 1) * 0.9,
          label: `${b.label}${b.watts ? ` · ${b.watts} W` : ''}`,
        }))
      : []
    const target = session?.targetWatts ?? null
    const steadyLabel = target ? `Steady · ${target} W` : 'Steady'
    const enduranceProfile = [
      { w: 0.34, work: false, label: 'Warm-up' },
      { w: 0.5, work: false, label: 'Warm-up' },
      { w: 0.66, work: false, label: 'Warm-up' },
      ...Array.from({ length: 8 }, () => ({ w: 0.88, work: true, label: steadyLabel })),
      { w: 0.6, work: false, label: 'Cool-down' },
      { w: 0.4, work: false, label: 'Cool-down' },
    ]
    // Today's power profile: the REAL interval blocks when the plan has them;
    // else the model's blocks; else the synthesized endurance envelope (only
    // when a day genuinely has no intervals); else the null-safe fixture shape.
    const blocks: W3Block[] = todayPlan && todayPlan.intervals.length > 0
      ? blocksFromIntervals(todayPlan.intervals, ftp)
      : realBlocks.length > 2
        ? realBlocks
        : session
          ? enduranceProfile
          : [0.28, 0.4, 0.5, 0.9, 0.22, 0.92, 0.22, 0.94, 0.22, 0.95, 0.3].map((w, i) => ({ w, work: i % 2 === 1 && i > 2 && i < 10, label: `Block ${i + 1}` }))

    const pmc = isPresent(model.pmc) ? model.pmc.value : null
    // 6-week mirror from the real PMC series when present, else a null-safe stub.
    const series = pmc?.series ?? []
    const maxCtl = Math.max(1, ...series.map((p) => p.ctl))
    const maxAtl = Math.max(1, ...series.map((p) => p.atl))
    const tail = series.slice(-42)
    const mirror = tail.length > 0
      ? {
          fitness: tail.map((p) => p.ctl / maxCtl),
          fatigue: tail.map((p) => p.atl / maxAtl),
          fitnessRaw: tail.map((p) => Math.round(p.ctl)),
          fatigueRaw: tail.map((p) => Math.round(p.atl)),
          todayIndex: tail.length - 1,
        }
      : { fitness: [], fatigue: [], fitnessRaw: [], fatigueRaw: [], todayIndex: 0 }

    // Weekday letters + per-day TSS from the model; the hit / missed / rested
    // status comes from the REAL forgiving streak (services/streak.py), which
    // reads actual activities + planned workouts + athlete status. This is the
    // honest, no-guilt rule: a planned rest day reads "rest" (never "missed"),
    // an unplanned quiet day isn't a failure, and only a genuinely skipped
    // planned session is "missed". Mon→Sun, aligned by index with model.week.
    const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const now = new Date()
    const todayDow = now.getDay() === 0 ? 6 : now.getDay() - 1
    const pad = (n: number) => String(n).padStart(2, '0')
    // ISO date for strip index i (Mon=0 … Sun=6), anchored on today's real date
    // so each day can find its own DayPlan in the week-ahead response.
    const isoForIndex = (i: number) => {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (i - todayDow))
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
    }
    const streakStates = streak?.week?.map((w) => w.state) ?? []
    const weekDays = model.week.map((d, i) => {
      const actual = isPresent(d.tss) ? d.tss.value : 0
      const isToday = i === todayDow
      // The REAL planned day (today + next 6 come from /weeks; past days aren't
      // in the response and keep their model/streak read).
      const plan = planByDate.get(isoForIndex(i)) ?? null
      const planIsSession = plan != null && isSessionDay(plan)
      // Map the real streak day-state onto the strip's visual status. Fall back
      // (before the streak loads) to an honest, non-guilt read: past days with
      // a ride are "hit", quiet past days are "rest" — never a fabricated miss.
      const st = streakStates[i]
      const status: 'today' | 'hit' | 'missed' | 'over' | 'rest' | 'upcoming' =
        isToday ? 'today'
          : st === 'upcoming' || i > todayDow ? 'upcoming'
            : st === 'missed' ? 'missed'
              : st === 'rest' || st === 'paused' ? 'rest'
                : st === 'trained' ? 'hit'
                  : st === 'unplanned' ? (actual > 0 ? 'hit' : 'rest')
                    : actual > 0 ? 'hit' : 'rest'
      // Planned TSS: today from the session; a future/today plan day from its
      // real target_tss; past days show the actual (no stored per-day plan).
      const plannedTss = isToday
        ? (session?.tss != null ? session.tss : actual)
        : plan?.target_tss != null ? Math.round(plan.target_tss)
          : actual
      // Title: today from the session; other days from the real DayPlan — null
      // for a rest-category day (the card renders it as a real Rest day).
      const title = isToday
        ? (session ? session.title : null)
        : planIsSession ? plan!.title
          : null
      // Real per-day target watts / %FTP from the plan (honest "—" without it).
      const dayW = !isToday && planIsSession ? planTargetWatts(plan!, ftp) : null
      const dayIF = !isToday && planIsSession ? planIF(plan!) : null
      const targetW = isToday
        ? (session?.targetWatts != null ? `${session.targetWatts} W` : '—')
        : dayW != null ? `${dayW} W` : '—'
      const ftpPct = isToday
        ? (session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}%` : '—')
        : dayIF != null ? `${Math.round(dayIF * 100)}%` : '—'
      // Per-day power profile: today reuses the session bars; a set future day
      // builds its own from real intervals; rest/past days have none.
      const dayBlocks: W3Block[] = isToday
        ? blocks
        : planIsSession && (plan!.intervals?.length ?? 0) > 0 ? blocksFromIntervals(plan!.intervals, ftp)
          : []
      return {
        letter: d.letter, num: '', actual, planned: plannedTss, status,
        title,
        dateLabel: WD[i] ?? d.letter, weekday: WD[i] ?? d.letter,
        targetW, ftpPct, blocks: dayBlocks,
      }
    })

    // Real week-progress label from the week strip (days trained/rested vs planned).
    const weekDone = weekDays.filter((d) => d.status === 'hit' || d.status === 'rest').length
    const weekPlanned = weekDays.filter((d) => d.status !== 'upcoming').length
    const weekDoneLabel = weekPlanned > 0 ? `${weekDone} of ${weekPlanned} done` : null
    const zoneTag = session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}% FTP` : null

    return {
      handle: user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider'),
      tierLine: 'Silver Tier · Week 6 of 16', // fixture: tier/season not modelled yet
      bikeName: 'Starter Bike', // fixture: bike economy not built (starter frame)
      weekDoneLabel,
      zoneTag,
      avatarUrl: user?.avatar_url ?? null,
      avatarInitial: (user?.display_name || user?.email || '?').charAt(0).toUpperCase(),
      streak: isPresent(model.streakDays) ? model.streakDays.value : null,

      readiness,
      // A one-word readiness read from the score (not the session name, which
      // is redundant with Today's Training below).
      readinessWord: readiness == null ? null
        : readiness >= 80 ? 'Primed'
          : readiness >= 65 ? 'Ready'
            : readiness >= 45 ? 'Steady'
              : readiness >= 30 ? 'Easy' : 'Rest',
      earnRate: '1.75×', // fixture: earn-rate economy not built
      coachDate: isPresent(model.dateLabel) ? model.dateLabel.value : '',
      coachLead: verdict ? verdict.headline : null,
      coachWhy: verdict ? verdict.body : null,

      hrv, rhr, sleep,

      weekMeta,
      weekDays,

      weather: {
        window: '16:00–18:00', temp: '19°', feels: '17°',
        hours: Array.from({ length: 12 }, (_, i) => ({ label: `${9 + i}:00`, q: [0.3, 0.35, 0.4, 0.5, 0.55, 0.6, 0.8, 1, 0.95, 0.7, 0.45, 0.3][i], peak: i === 7 || i === 8 })),
        meta: 'Bar is ride quality — wind, rain and temperature combined. 8 km/h SW, dry until 21:00.',
        routeName: 'Elbe Loop · Nord', routeStats: '48 km · 320 m · 3 ramps', routeTag: 'RIDDEN 6× · BEST MATCH',
        routeWhy: 'Its three ramps run 8–9 minutes at 4–5% — the exact length of today’s blocks, so you can hold 285 W without traffic breaking the effort.',
        recordProof: 'Your 288 W record was set on this loop',
      }, // fixture: weather/route recommendation service not wired yet

      mirror,

      sessionTitle: session ? session.title : null,
      sessionDur: session && session.tss ? `${Math.round((session.tss / 100) * 68)} min` : null,
      sessionTargetW: session?.targetWatts != null ? `${session.targetWatts} W` : '—',
      sessionTss: session?.tss != null ? String(session.tss) : '—',
      sessionFtpPct: session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}%` : '—',
      sessionBlocks: blocks,
      sessionFtpTag: 'FTP',
      sessionEarn: 'This ride earns RideCoin by its TSS', // fixture: RideCoin not built

      form: pmc ? { fitness: Math.round(pmc.fitness), fatigue: Math.round(pmc.fatigue), formVal: Math.round(pmc.form) } : null,

      // ── crew standings: REAL from useCrewStandings; honest fixture only when
      //    the athlete is in no crew yet (no standings to show) ──
      crewCaption: realCrewCaption ?? 'Join a crew to see how your week stacks up against your riders.',
      crew: realCrew ?? [
        { name: 'Mara', color: '#7B5CFF', pct: 143, me: false },
        { name: 'You', color: '#2BE68F', pct: 131, me: true },
        { name: 'Timo', color: '#6B8CFF', pct: 104, me: false },
      ],
      crewRank: realCrewRank ?? '↑1',
      challengeLabel: 'CREW-CHALLENGE · AROUND THE WORLD',   // fixture: crew-challenge banner not wired
      challengeValue: '412 / 500 km',
      challengePct: 82,

      // ── fixtures: Garage economy — spec'd, not wired ──
      garagePct: 68,
      garageName: 'Carbon frame',
      garageRidesLine: '17 of 25 rides',
      garageMakesLine: "Today's session makes 18",
      power: '625.3K',
      cycle: '1,448',
      mRides: { pct: 50, label: '25 rides' },
      mDist: { pct: 73, label: '200 km' },
    }
  }, [model, user, streak, standings, adaptive, week, ftp])

  // Real adapt that PERSISTS: Easier/Harder/Shorter/Indoor hit POST
  // /workouts/today/modify (the audited workout modifier — writes the new
  // session server-side, safety rails enforced via `rails_downgraded`). On
  // success we invalidate the week + coach-brief caches so the card rebuilds
  // from the persisted session (title/TSS/blocks all refresh). Rest is
  // deterministic (the modifier has no rest type) and never hits the endpoint.
  // A failed/absent modify → null, surfaced as an honest "no plan to adapt".
  const onAdapt = useCallback<OnAdapt>(async (kind) => {
    if (kind === 'rest') return { targetW: '—', tss: 0, ftpPct: '—', rationale: 'Full rest today. Let the load settle — tomorrow’s block hits harder for it.', railsDowngraded: false, title: 'Rest day' }
    const modType: TodayModificationType = kind === 'shorter' ? 'shorten' : kind
    const durationMin = kind === 'shorter' ? 45 : undefined
    const res = await modifyTodayWorkout(modType, durationMin)
    if (!res.success) return null
    // Persisted — refresh the real plan + brief so the card shows the new session.
    void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
    void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
    const durTail = res.duration_min != null ? ` · ${res.duration_min} min` : ''
    return {
      // The modifier doesn't echo watts/IF — "—" here falls back to the base
      // numbers, which the refreshed week fills in with the new session.
      targetW: '—',
      tss: res.predicted_tss ?? null,
      ftpPct: '—',
      rationale: res.title ? `Adjusted — ${res.title}${durTail}` : (res.reason || 'Coach adjusted the session.'),
      railsDowngraded: res.rails_downgraded ?? false,
      title: res.title ?? null,
    }
  }, [qc])

  // First-open gate: a rider who has never seen the W3 intro lands on the
  // onboarding chain instead of a cold Today. localStorage-backed, so it fires
  // once per browser; the Garage step marks it seen. (After all hooks, so the
  // Rules of Hooks hold regardless of this branch.)
  if (user && !hasSeenW3Onboarding()) {
    return <Navigate to="/e/w3-onboard-welcome" replace />
  }

  return <W3TodayView vm={vm} onAdapt={onAdapt} />
}

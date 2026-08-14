import { useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useTodayModel } from '../data/useTodayModel'
import { useDayState } from '../state/useDayState'
import { useStreak } from '../../hooks/useStreak'
import { useGarage } from '../../hooks/useGarage'
import { useCrewStandings } from '../../hooks/useCrew'
import { useAdaptive } from '../../hooks/useAdaptive'
import { useCurrentWeek, WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { parseISO, fmtDEShort, DE_WD2 } from './w3plan'
import { useTodayWeather, type TodayWeather } from '../../hooks/useTodayWeather'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { isPresent } from '../data/value'
import { formatMultiplier, nextStreakTier, streakMultiplier } from '../../api/rewards'
import { DASH, T } from './w3tokens'
import { modifyTodayWorkout, type TodayModificationType } from '../../api/todayModify'
import type { DayPlan, IntervalBlockOut } from '../../api/weeks'
import { hasSeenW3Onboarding } from './w3Onboarding'
import W3TodayView, { type W3Vm, type W3Signal, type W3Spark, type W3Block, type OnAdapt } from './W3TodayView'
import type { W3Weather } from './W3Sections'

/** A signal card's baseline comparison, computed from the rider's OWN recent
 *  readings: the mean of every day in the window EXCEPT the one on display.
 *  Returns null below `MIN_BASELINE_DAYS` prior readings — an "average" of one
 *  or two nights is not a baseline, and the card says "—" instead. `n` rides
 *  along so the label can name the real window ("vs 5-day avg"), never claim a
 *  7-day mean the rider's data can't support. */
const MIN_BASELINE_DAYS = 3
function baselineOf(series: number[] | null | undefined): { mean: number; n: number } | null {
  if (!series || series.length < MIN_BASELINE_DAYS + 1) return null
  const prior = series.slice(0, -1)
  return { mean: prior.reduce((s, v) => s + v, 0) / prior.length, n: prior.length }
}

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
 * The bike hero is real too: `useGarage()` returns the collectible the rider
 * actually rendered in the studio, or null, and the View shows the offer to
 * make one rather than a stock stand-in.
 * What remains of the reward-economy layer (Power/Cycle balances, the Garage
 * upgrade, the crew challenge) has no backend yet, so those fields are DESIGN
 * FIXTURES reproducing the pen; each is marked `fixture:` below. The EARN RATE
 * left that list on 2026-08-13: it is now derived from the rider's real streak
 * through `api/rewards.ts`'s single tier table, which mirrors the server's
 * `rewards.streak_multiplier()` (hard-capped at ×1.5 — the old hardcoded
 * "1.75×" was a rate the backend could never actually pay out).
 */

/** Build a spark from a REAL series, or null when there isn't one (the card
 *  then draws an empty track — see `Spark` in W3TodayView).
 *
 *  Normalised across the window's own min→max rather than to zero: resting HR
 *  lives in a 54-62 bpm band and sleep in a 6-8 h one, so a zero-based scale
 *  renders every night as a full bar and hides the very movement the card
 *  exists to show. Floor of 0.22 keeps the low bar visible. */
function sparkFrom(series: number[] | null | undefined, hi: string): W3Spark | null {
  if (!series || series.length < 2) return null
  const tail = series.slice(-7)
  const lo = Math.min(...tail)
  const span = Math.max(...tail) - lo
  const bars = span > 0 ? tail.map((v) => 0.22 + ((v - lo) / span) * 0.78) : tail.map(() => 0.6)
  return { bars, hi }
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

// ── Real weather → the "Where and when to ride it" card ─────────────────────
const WMO_DRY = new Set([0, 1, 2, 3, 45, 48])
/** A 0–1 ride-quality score per hour from real precip / wind / temp. */
function hourQuality(h: TodayWeather['hours'][number]): number {
  let q = 1
  if (h.precip_prob != null) q -= (h.precip_prob / 100) * 0.6
  if (h.wind_kmh != null) q -= Math.min(0.3, h.wind_kmh / 60)
  if (h.temp_c != null) { if (h.temp_c < 6 || h.temp_c > 30) q -= 0.35; else if (h.temp_c < 10 || h.temp_c > 26) q -= 0.15 }
  if (h.code != null && !WMO_DRY.has(h.code)) q -= 0.1
  return Math.max(0.06, Math.min(1, q))
}
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** Build the real weather VM from /weather/today, or null when unavailable.
 *  TODAY ONLY — the endpoint has no multi-day forecast, and the card refuses to
 *  show these numbers under any other date. */
function buildWeather(tw: TodayWeather | undefined): W3Weather | null {
  if (!tw?.available || !tw.hours?.length) return null
  // Daytime ride window: 07:00–21:00 local.
  const hrs = tw.hours
    .map((h) => ({ ...h, hour: new Date(h.time).getHours(), q: hourQuality(h) }))
    .filter((h) => h.hour >= 7 && h.hour <= 21)
  if (hrs.length < 2) return null
  // Best 2-hour window = highest average quality.
  let bestI = 0, bestAvg = -1
  for (let i = 0; i < hrs.length - 1; i++) {
    const avg = (hrs[i].q + hrs[i + 1].q) / 2
    if (avg > bestAvg) { bestAvg = avg; bestI = i }
  }
  const a = hrs[bestI], b = hrs[bestI + 1]
  const pk = a.q >= b.q ? a : b
  const pad = (n: number) => `${String(n).padStart(2, '0')}:00`
  const dry = hrs.every((h) => (h.precip_prob ?? 0) < 40)
  const wind = pk.wind_kmh != null ? `${Math.round(pk.wind_kmh)} km/h${pk.wind_dir_deg != null ? ` ${DIRS[Math.round(pk.wind_dir_deg / 45) % 8]}` : ''}` : 'calm'
  return {
    window: `${pad(a.hour)}–${pad(b.hour + 1)}`,
    temp: pk.temp_c != null ? `${Math.round(pk.temp_c)}°` : '—',
    feels: pk.temp_c != null ? `${Math.round(pk.temp_c - (pk.wind_kmh ?? 0) / 15)}°` : '—',
    // Real conditions in one line: wind at the peak hour + whether the day stays dry.
    short: `${wind} · ${dry ? 'trocken' : 'Schauer möglich'}`,
    // The verdict is EARNED by the best window's real ride quality, not a badge
    // that's always on.
    verdict: bestAvg >= 0.72 ? 'GO OUTSIDE' : bestAvg >= 0.45 ? 'DOABLE' : 'INDOOR BETTER',
    meta: 'Bestes 2-Stunden-Fenster aus Wind, Regen und Temperatur.',
  }
}

export default function W3TodayPage() {
  const { state } = useDayState()
  const model = useTodayModel(state)
  const { user } = useAuth()
  const { data: streak } = useStreak()
  // The rider's garage — real state now, so the hero can show THEIR bike (or
  // honestly show that they don't have one yet).
  const { data: garage, isLoading: garageLoading } = useGarage()
  const { data: standings } = useCrewStandings('week')
  const { data: adaptive } = useAdaptive()
  // The REAL week-ahead plan (today + next 6 days) — the same source the Train
  // tab reads. Each DayPlan carries its title / target_tss / category / interval
  // blocks, so every day in the strip (not just today) gets its real session.
  const { data: week } = useCurrentWeek(0)
  const { data: profile } = useAthleteProfile()
  const { data: todayWeather } = useTodayWeather()
  // The week's real activities — for a past day's ACTUAL duration / power / HR.
  const { data: weekActs } = useActivitiesRange(
    new Date(Date.now() - 8 * 86_400_000), new Date(),
  )
  const qc = useQueryClient()
  const ftp = profile?.ftp_watts ?? null

  const vm = useMemo<W3Vm>(() => {
    const realWeather = buildWeather(todayWeather)
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

    // ── Readiness vs yesterday ─────────────────────────────────────────────
    // REAL, from `model.readinessVsPrevious` — the two most recent DATED
    // `training_readiness` readings in the `/daily-metrics` window. Shown only
    // when the score on the hero IS the reading the delta was computed on
    // (`score` match): the moment readiness comes from the adaptive-engine
    // fallback instead, the two numbers are different quantities and the delta
    // would be measuring something the big number isn't showing.
    const rvp = isPresent(model.readinessVsPrevious) ? model.readinessVsPrevious.value : null
    const dayGapLabel = (onIso: string, vsIso: string): string => {
      const days = Math.round((Date.parse(`${onIso}T00:00:00`) - Date.parse(`${vsIso}T00:00:00`)) / 86_400_000)
      if (days <= 1) return 'vs yesterday'
      return `vs ${days} days ago`
    }
    const readinessDelta = rvp != null && readiness != null && rvp.score === readiness
      ? {
          text: `${rvp.delta > 0 ? '+' : rvp.delta < 0 ? '−' : '±'}${Math.abs(rvp.delta)} ${dayGapLabel(rvp.onIso, rvp.vsIso)}`,
          favourable: rvp.delta >= 0,
        }
      : null

    // ── Earn rate ──────────────────────────────────────────────────────────
    // REAL: the rider's forgiving streak (`GET /athletes/me/streak` via
    // `useStreak`) run through `streakMultiplier()` — the ONE frontend copy of
    // rewards.py's `_STREAK_TIERS`, living in `api/rewards.ts` so the two can't
    // drift. Nothing on the wire carries a current multiplier (`/rewards/wallet`
    // returns balance/ledger/tier; the ledger's `multiplier` is per past ride),
    // so deriving it here is the only honest route to a forward-looking rate.
    // No streak yet → "—", never a number the server can't pay.
    const streakDays = streak?.streak ?? null
    const earnRate = streakDays == null ? DASH : formatMultiplier(streakMultiplier(streakDays))
    const nextTier = streakDays == null ? null : nextStreakTier(streakDays)
    const toGo = nextTier != null && streakDays != null ? nextTier.days - streakDays : null
    const earnRateWhy = streakDays == null
      ? null
      : streakDays < 3
        // Below the first tier there is no bonus to name — say what unlocks one.
        ? (nextTier && toGo != null ? `${toGo} ${toGo === 1 ? 'day' : 'days'} to ${formatMultiplier(nextTier.multiplier)}` : null)
        : nextTier && toGo != null
          ? `${streakDays}-day streak · ${toGo} to ${formatMultiplier(nextTier.multiplier)}`
          : `${streakDays}-day streak · max rate`

    // ── The three overnight signals ────────────────────────────────────────
    // Each card shows the real reading AND how it sits against the rider's own
    // recent history. The baselines are NOT interchangeable, so each card names
    // the one it actually used:
    //  · HRV       — `/health/morning-check`'s 28-day personal baseline
    //                (morning_health_detector.py). Real, but INTERMITTENT: the
    //                detector emits a signal only on a morning the metric is
    //                genuinely off baseline, so most days it has no delta and
    //                the card honestly prints "—". There is no second HRV
    //                series to fill the gap with (see model.hrv.series).
    //  · Resting HR — the mean of the OTHER days in `model.recentRestingHr`
    //                (the real 7-day `/daily-metrics` window). Available every
    //                day, so this is what the card leads with; the
    //                morning-check delta is used when the detector did fire,
    //                since that's the sharper 28-day read.
    //  · Sleep     — the mean of the other nights in `model.recentSleep`
    //                (same `/daily-metrics` window). The morning-check's sleep
    //                signal is a 0-100 SCORE and can never be a baseline for a
    //                duration, so it is deliberately not used here.
    const NEUTRAL = T.mid
    /** Sub-line for a card: signed delta, coloured by whether the move is the
     *  good direction for that metric. Calm, never alarming — favourable is
     *  acid, everything else is quiet grey rather than a red warning. */
    const subOf = (text: string, favourable: boolean) => ({ sub: text, subHue: favourable ? T.acid : NEUTRAL })
    const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`

    const hrvSeries = isPresent(model.hrv) ? model.hrv.value.series : null
    const hrv: W3Signal | null = isPresent(model.hrv)
      ? (() => {
          const { value, delta } = model.hrv.value
          const s = delta == null ? { sub: null, subHue: NEUTRAL } : subOf(`${signed(delta)} vs baseline`, delta >= 0)
          return { value: String(Math.round(value)), unit: 'ms', ...s, spark: sparkFrom(hrvSeries, '#00E5FF') }
        })()
      : null

    const rhrSeries = isPresent(model.recentRestingHr) ? model.recentRestingHr.value.map((d) => d.bpm) : null
    const rhr: W3Signal | null = isPresent(model.restingHr)
      ? (() => {
          const { value, delta } = model.restingHr.value
          const base = baselineOf(rhrSeries)
          // Lower resting HR is the favourable direction.
          const s = delta != null
            ? subOf(`${signed(delta)} vs baseline`, delta <= 0)
            : base != null
              ? subOf(`${signed(value - base.mean)} vs ${base.n}-day avg`, value - base.mean <= 0)
              : { sub: null, subHue: NEUTRAL }
          return { value: String(Math.round(value)), unit: 'bpm', ...s, spark: sparkFrom(rhrSeries, '#C8FF00') }
        })()
      : null

    const sleepSeries = isPresent(model.recentSleep) ? model.recentSleep.value.map((d) => d.totalS) : null
    const sleep: W3Signal | null = isPresent(model.sleep)
      ? (() => {
          const totalS = model.sleep.value.totalS
          const hrs = Math.floor(totalS / 3600)
          const mins = Math.round((totalS % 3600) / 60)
          const base = baselineOf(sleepSeries)
          // More sleep is the favourable direction; the delta reads in minutes,
          // which is the unit a rider actually feels a night's difference in.
          const deltaMin = base != null ? Math.round((totalS - base.mean) / 60) : null
          const s = deltaMin != null && base != null
            ? subOf(`${signed(deltaMin)} min vs ${base.n}-day avg`, deltaMin >= 0)
            : { sub: null, subHue: NEUTRAL }
          return { value: `${hrs}:${String(mins).padStart(2, '0')}`, unit: 'hrs', ...s, spark: sparkFrom(sleepSeries, '#ED29FF') }
        })()
      : null

    const weekMeta = isPresent(model.weekLoad)
      ? `${Math.round(model.weekLoad.value.spent)} of ${Math.round(model.weekLoad.value.planned)} TSS`
      : '—'

    // The real week-ahead plan, indexed by ISO date so each strip day can look
    // up its own DayPlan (title / TSS / category / intervals).
    const planByDate = new Map<string, DayPlan>()
    for (const dp of week?.days ?? []) planByDate.set(dp.date.slice(0, 10), dp)
    // Actual ridden cycling activity per local date (biggest-TSS ride wins).
    const actByDate = new Map<string, { durMin: number; w: number | null; hr: number | null; tss: number }>()
    for (const a of weekActs?.activities ?? []) {
      if (a.sport !== 'cycling') continue
      const key = new Date(a.started_at).toISOString().slice(0, 10)
      const cur = actByDate.get(key)
      const tss = a.tss ?? 0
      if (!cur || tss > cur.tss) {
        actByDate.set(key, {
          durMin: (a.duration_seconds ?? 0) / 60,
          w: a.normalized_power ?? a.average_power ?? null,
          hr: a.average_hr ?? null,
          tss,
        })
      }
    }
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
    const WD = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
    const now = new Date()
    const todayDow = now.getDay() === 0 ? 6 : now.getDay() - 1
    const pad = (n: number) => String(n).padStart(2, '0')
    // The real calendar date behind strip index i (Mon=0 … Sun=6), anchored on
    // today — it drives the day cell's number, its label and its DayPlan lookup.
    const dateForIndex = (i: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + (i - todayDow))
    const isoForIndex = (i: number) => {
      const dt = dateForIndex(i)
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
      // What was actually ridden on a past day (real activity), for the
      // planned-vs-done stats — only for past days that carry a ride.
      const act = !isToday && i < todayDow ? actByDate.get(isoForIndex(i)) : undefined
      const dt = dateForIndex(i)
      return {
        letter: d.letter, num: String(dt.getDate()), actual, planned: plannedTss, status,
        title,
        dateLabel: `${DE_WD2[i] ?? d.letter}, ${fmtDEShort(dt)}`, weekday: WD[i] ?? d.letter,
        targetW, ftpPct, blocks: dayBlocks,
        actualDurMin: act?.durMin ?? null,
        actualW: act?.w ?? null,
        actualHr: act?.hr ?? null,
      }
    })

    // Real week-progress label from the week strip (days trained/rested vs planned).
    const weekDone = weekDays.filter((d) => d.status === 'hit' || d.status === 'rest').length
    const weekPlanned = weekDays.filter((d) => d.status !== 'upcoming').length
    const weekDoneLabel = weekPlanned > 0 ? `${weekDone} of ${weekPlanned} done` : null
    const zoneTag = session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}% FTP` : null

    // ── "Deine Woche": real meso block + the season goal this week feeds ──
    const meso = week?.meso_block ?? null
    const BLOCK_DE: Record<string, string> = { accumulation: 'Aufbaublock', transmutation: 'Spezifischer Block', realization: 'Wettkampfblock', recovery: 'Ruhewoche' }
    const blockName = meso ? (BLOCK_DE[meso.block_position] ?? 'Trainingsblock') : 'Trainingsblock'
    const weekBlockLabel = meso
      ? `${blockName}${meso.block_index_in_meso ? ` · Woche ${meso.block_index_in_meso}` : ''}`
      : 'Deine Trainingswoche'
    const weekDoneChip = weekPlanned > 0 ? `${weekDone} / ${weekPlanned} erledigt` : null
    const weekLoadLabel = isPresent(model.weekLoad)
      ? `${Math.round(model.weekLoad.value.spent)} von ${Math.round(model.weekLoad.value.planned)} TSS`
      : '—'
    const evName = profile?.goals?.target_event_name ?? null
    const evDate = profile?.target_event_date ? parseISO(profile.target_event_date) : null
    const daysToEv = meso?.days_to_event ?? (evDate ? Math.max(0, Math.round((evDate.getTime() - Date.now()) / 86400000)) : null)
    const weeksToEv = daysToEv != null ? Math.ceil(daysToEv / 7) : null
    const weekGoal = evName && evDate
      ? { name: evName, right: weeksToEv != null ? `in ${weeksToEv} Wochen` : '—', sub: fmtDEShort(evDate) }
      : null
    const planWeeks = weeksToEv != null ? `${weeksToEv} Wochen` : ''

    return {
      handle: user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider'),
      tierLine: 'Silver Tier · Week 6 of 16', // fixture: tier/season not modelled yet
      // REAL: the rider's own digitalised bike. The name comes from the vision
      // pass reading their photo; "Your bike" is only a label fallback for a
      // render the model couldn't name — never a stand-in for a missing bike,
      // which stays `bikeImage: null` and gets the hero's empty state.
      bikeName: garage?.bike?.name ?? 'Your bike',
      bikeImage: garage?.bike?.image_base64 ?? null,
      bikeLoading: garageLoading,
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
      readinessDelta,
      earnRate,
      earnRateWhy,
      coachDate: isPresent(model.dateLabel) ? model.dateLabel.value : '',
      coachLead: verdict ? verdict.headline : null,
      coachWhy: verdict ? verdict.body : null,

      hrv, rhr, sleep,

      weekMeta,
      weekDays,
      weekBlockLabel,
      weekDoneChip,
      weekLoadLabel,
      weekGoal,
      planWeeks,

      // REAL weather from /weather/today (buildWeather) — today only. Without a
      // forecast there are no numbers at all, just the honest reason why.
      weather: realWeather ?? {
        window: '—', temp: '—', feels: '—', short: null, verdict: null,
        meta: 'Wetter erscheint, sobald du eine Fahrt mit GPS geloggt hast — dann steht hier dein bestes Fenster für heute.',
      },

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
  }, [model, user, streak, standings, adaptive, week, ftp, todayWeather, weekActs, garage, garageLoading])

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

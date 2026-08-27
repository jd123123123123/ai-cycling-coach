import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useTodayModel } from '../data/useTodayModel'
import { useDayState } from '../state/useDayState'
import { useStreak } from '../../hooks/useStreak'
import { useGarage, useSelectStage, useTodayStage } from '../../hooks/useGarage'
import { useGarageCollection } from '../../hooks/useShop'
import { itemById } from './w3shop'
import { useChest, useWallet } from '../../hooks/useWallet'
import { useAdaptive } from '../../hooks/useAdaptive'
import { useCurrentWeek, WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { hasPlanFromWeek } from './w3hasPlan'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { parseISO, fmtDEShort, DE_WD2 } from './w3plan'
import { useTodayWeather } from '../../hooks/useTodayWeather'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { isPresent } from '../data/value'
import { forecastRideRc, formatMultiplier, nextStreakTier, streakMultiplier } from '../../api/rewards'
import { DASH, T } from './w3tokens'
import { modifyTodayWorkout, type TodayModificationType } from '../../api/todayModify'
import type { DayPlan, IntervalBlockOut } from '../../api/weeks'
import { blockLine } from './w3block'
import W3TodayView, { type W3Vm, type W3Signal, type W3Spark, type W3Block, type OnAdapt } from './W3TodayView'
import { buildWeather } from './w3weatherWindow'

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
 * THERE ARE NO FIXTURES LEFT IN THIS VM. That sentence used to read "what
 * remains of the reward-economy layer … are DESIGN FIXTURES reproducing the
 * pen, each marked `fixture:` below"; the list emptied out over 2026-08-13/18:
 *
 *  · earn rate      — the rider's real streak through `api/rewards.ts`'s single
 *                     tier table, mirroring `rewards.streak_multiplier()`
 *                     (hard-capped at ×1.5; the old hardcoded "1.75×" was a
 *                     rate the backend could never actually pay out).
 *  · per-ride earn  — `forecastRideRc()`, the port of `rewards.base_ride_rc()`
 *                     × the real multiplier, labelled as the forecast it is and
 *                     null on a rest day.
 *  · tier line      — the real mesocycle block from `/weeks/current`, null
 *                     without a plan (was "Silber · Woche 6 von 16").
 *  · crew standings — moved out of the vm entirely into `W3TodayRank`, which
 *                     reads `/crews/me/standings` (was three invented riders
 *                     under an invented "um die Welt" challenge).
 *  · power profile  — real interval blocks, or an empty array. No session no
 *                     longer synthesises an 11-bar workout nobody prescribed.
 *
 * Keep it that way: a number in this file either has an endpoint behind it or
 * is `null`.
 */

/** The line under the rider's handle: which block they're in and how far into
 *  it. Real, from `/weeks/current` → `meso_block`. Null without a plan, so the
 *  header shows the handle alone rather than a stand-in.
 *
 *  Reuses `BLOCK_DE` and the same "Woche n von 4" phrasing W3WhyToday already
 *  uses — one vocabulary for the block, not two that can drift apart. */

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
      const offLabel = offW != null ? `Erholen · ${offW} W` : 'Erholen'
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
  const navigate = useNavigate()
  const { state } = useDayState()
  const model = useTodayModel(state)
  const { user } = useAuth()
  const { data: streak } = useStreak()
  // The rider's garage — real state now, so the hero can show THEIR bike (or
  // honestly show that they don't have one yet).
  const { data: garage, isLoading: garageLoading } = useGarage()
  // The RideCoin collection — the bike they own and the parts they've bolted to
  // it. Already fetched by W3Guard on the way in, so this is a cache read.
  const { data: collection } = useGarageCollection()
  const collectibleBike = itemById(collection?.loadout.bike)
  // The composed photograph of their build when one has been made, and the
  // bike's own catalogue photo until then — the same fallback the garage uses,
  // so the bike does not change appearance between the two screens.
  const collectibleArt = collection?.render ?? collectibleBike?.art ?? null
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
  // REAL RideCoin balance for the hero's identity card.
  const { data: wallet } = useWallet()
  // A ride waiting to be opened takes over the readiness slot until it is.
  const { data: chest } = useChest()
  // The avatar and the bike exactly as the rider has them configured, plus the
  // stages they can swipe between. A cheap cached read — it never renders.
  const { data: today } = useTodayStage()
  const selectStage = useSelectStage()
  const qc = useQueryClient()
  const ftp = profile?.ftp_watts ?? null

  // ── No day scene. Deliberately. ─────────────────────────────────────────
  // Today used to derive a pose, read `/garage/scene/today` for a composed
  // rider-on-bike image, and offer to render one on tap. The pen's stage
  // (`W3TodayStage`) shows the rider bust and the isolated bike SEPARATELY —
  // two renders the rider already owns — so this screen now needs no scene at
  // all. That removes an image-model round trip, a mutation, and the app's most
  // failure-prone prompt from its most visited screen. `poseForDay` and the
  // scene hooks still serve the RIDE surfaces, where a composed scene is the
  // whole point.

  const vm = useMemo<W3Vm>(() => {
    const realWeather = buildWeather(todayWeather)
    // NOTE: the crew standings no longer travel through this vm. "Dein Rang"
    // is `W3TodayRank`, which reads GET /crews/me + /crews/me/standings itself
    // and renders an honest empty state instead of the fixture riders that used
    // to live here.

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
      if (days <= 1) return 'ggü. gestern'
      return `ggü. vor ${days} Tagen`
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
        ? (nextTier && toGo != null ? `noch ${toGo} ${toGo === 1 ? 'Tag' : 'Tage'} bis ${formatMultiplier(nextTier.multiplier)}` : null)
        : nextTier && toGo != null
          ? `${streakDays} Tage Streak · noch ${toGo} bis ${formatMultiplier(nextTier.multiplier)}`
          : `${streakDays} Tage Streak · Maximum`

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
          const s = delta == null ? { sub: null, subHue: NEUTRAL } : subOf(`${signed(delta)} zur Baseline`, delta >= 0)
          return { value: String(Math.round(value)), unit: 'ms', ...s, spark: sparkFrom(hrvSeries, T.hrv) }
        })()
      : null

    const rhrSeries = isPresent(model.recentRestingHr) ? model.recentRestingHr.value.map((d) => d.bpm) : null
    const rhr: W3Signal | null = isPresent(model.restingHr)
      ? (() => {
          const { value, delta } = model.restingHr.value
          const base = baselineOf(rhrSeries)
          // Lower resting HR is the favourable direction.
          const s = delta != null
            ? subOf(`${signed(delta)} zur Baseline`, delta <= 0)
            : base != null
              ? subOf(`${signed(value - base.mean)} zum ${base.n}-Tage-Ø`, value - base.mean <= 0)
              : { sub: null, subHue: NEUTRAL }
          return { value: String(Math.round(value)), unit: 'bpm', ...s, spark: sparkFrom(rhrSeries, T.acid) }
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
            ? subOf(`${signed(deltaMin)} min zum Ø`, deltaMin >= 0)
            : { sub: null, subHue: NEUTRAL }
          return { value: `${hrs}:${String(mins).padStart(2, '0')}`, unit: 'h', ...s, spark: sparkFrom(sleepSeries, T.sleep) }
        })()
      : null

    const weekMeta = isPresent(model.weekLoad)
      ? `${Math.round(model.weekLoad.value.spent)} von ${Math.round(model.weekLoad.value.planned)} TSS`
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
    const steadyLabel = target ? `Konstant · ${target} W` : 'Konstant'
    const enduranceProfile = [
      { w: 0.34, work: false, label: 'Einfahren' },
      { w: 0.5, work: false, label: 'Einfahren' },
      { w: 0.66, work: false, label: 'Einfahren' },
      ...Array.from({ length: 8 }, () => ({ w: 0.88, work: true, label: steadyLabel })),
      { w: 0.6, work: false, label: 'Ausfahren' },
      { w: 0.4, work: false, label: 'Ausfahren' },
    ]
    // Today's power profile: the REAL interval blocks when the plan has them;
    // else the model's blocks; else the synthesized endurance envelope — which
    // is only drawn when a session genuinely EXISTS and simply carries no
    // intervals (a steady ride materialises to 1–2 blocks and would otherwise
    // render as one flat beam).
    //
    // With no session at all: NO BARS. This used to fall through to an invented
    // 11-bar interval shape labelled "Block 1…Block 11" — a workout the rider
    // was never prescribed, drawn at full fidelity on the day they had nothing.
    // An empty array is the honest answer, and the card omits the chart.
    const blocks: W3Block[] = todayPlan && todayPlan.intervals.length > 0
      ? blocksFromIntervals(todayPlan.intervals, ftp)
      : realBlocks.length > 2
        ? realBlocks
        : session
          ? enduranceProfile
          : []

    // NOTE: CTL/ATL/TSB no longer travel through this vm either. "Dein
    // aktueller Status" is `W3TodayStatus`, which reads the full 90-day
    // /training-load/pmc series itself — the old 42-bar mirror normalised each
    // series to its own max, which made two different quantities look like one
    // scale and hid where the numbers actually sat.

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
        // The day TYPE, which `status` cannot carry: for today `status` is
        // always 'today', so a prescribed rest day looked like a session and
        // rendered interval beams under the heading "Ruhetag". Today is rest
        // when the coach handed us no session; any other day when its plan
        // exists and prescribes no work.
        // THE PLAN GETS A VOTE ON TODAY, NOT JUST THE SESSION FEED. This read
        // `isToday ? !session : …`, so today counted as rest only when the
        // coach handed us nothing at all. When a session object arrives ALONGSIDE
        // a rest-category plan — which is what happens on a real rest day that
        // still carries a placeholder — `!session` was false, the card fell
        // through to the session branch, and drew interval beams and an FTP
        // line under a day the plan had prescribed as rest. Reported from the
        // live app 2026-08-19; "Warum diese Einheit" said Ruhetag on the same
        // screen, which is exactly the contradiction the rider saw.
        // `isSessionDay` already treats category 'rest' as rest, so today now
        // asks it the same question every other day is asked.
        rest: isToday
          ? (!session || (plan != null && !planIsSession))
          : (plan != null && !planIsSession),
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
    const weekDoneLabel = weekPlanned > 0 ? `${weekDone} von ${weekPlanned} erledigt` : null

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
      // Was 'Silber · Woche 6 von 16' — a tier and a season the app does not
      // model, invented under the handle of every rider. Replaced with the one
      // thing that IS true about where they stand: their real block and how far
      // into it they are (`/weeks/current` → meso_block). Null when there is no
      // plan, and the View then renders nothing rather than a stand-in.
      tierLine: blockLine(meso),
      // REAL: the rider's own digitalised bike. The name comes from the vision
      // pass reading their photo; "Your bike" is only a label fallback for a
      // render the model couldn't name — never a stand-in for a missing bike,
      // which stays `bikeImage: null` and gets the hero's empty state.
      bikeName: today?.bike_name ?? garage?.bike?.name ?? 'Dein Bike',
      // THE CONFIGURED BIKE FIRST. `/garage/today` returns the machine wearing
      // its equipped parts and standing in the stage the rider chose; the plain
      // garage render is the fallback for a build that has never been composed,
      // and it is the same bicycle either way — just on the bare floor.
      bikeImage: today?.bike_image ?? garage?.bike?.image_base64 ?? null,
      bikeLoading: garageLoading,
      // Same for the face: the bust WEARING its helmet and glasses when one has
      // been composed, the bare-headed collectible until then.
      riderImage: today?.rider_image ?? garage?.rider?.image_base64 ?? null,
      // A composed render is one the Today endpoint returned that ISN'T the
      // plain garage collectible — the machine wearing its parts, standing
      // somewhere. It is a photograph of a place and needs the opposite
      // treatment to a cut-out on a studio sweep; see `W3TodayStage.SCENE_ART`.
      bikeInScene: Boolean(
        today?.bike_image && today.bike_image !== garage?.bike?.image_base64,
      ),
      stages: today?.stages,
      stage: today?.stage,
      onSelectStage: selectStage.mutate,
      stageRendering: selectStage.isPending,
      // REAL: the collectible they claimed and have been upgrading. A separate
      // thing from `bikeImage` (that one is a render of their actual machine),
      // and the reason Today no longer shows a stranger's bike to a rider who
      // owns one. `useGarageCollection` is already warm — W3Guard runs it to
      // enforce the first-bike claim before this route mounts.
      collectible: collectibleArt,
      collectibleName: collectibleBike?.name ?? null,
      // REAL: the RideCoin wallet balance. "—" until it loads — never a number
      // the ledger can't account for.
      coins: wallet ? wallet.balance.toLocaleString('de-DE') : null,
      weekDoneLabel,
      avatarUrl: user?.avatar_url ?? null,
      avatarInitial: (user?.display_name || user?.email || '?').charAt(0).toUpperCase(),
      streak: isPresent(model.streakDays) ? model.streakDays.value : null,

      // A sealed chest hides the readiness dock entirely — see `W3RideChest`.
      chest: chest ?? null,
      readiness,
      // A one-word readiness read from the score (not the session name, which
      // is redundant with Today's Training below).
      readinessWord: readiness == null ? null
        : readiness >= 80 ? 'Topfit'
          : readiness >= 65 ? 'Bereit'
            : readiness >= 45 ? 'Solide'
              : readiness >= 30 ? 'Locker' : 'Ruhe',
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
      // A PLAN IS A PRESCRIBED WEEK, and nothing softer. The rule lives in
      // `w3hasPlan.ts` because the plan route decides the same thing.
      //
      // This read `meso != null || weekPlanned > 0`, and BOTH halves are true
      // for every athlete: `/weeks/current` builds a `MesoBlockContext`
      // unconditionally, and the strip stamps today 'today' before any other
      // test, so `weekPlanned` never fell below one. `hasPlan` was a constant
      // `true` wearing a condition, and `W3PickGoalCard` below could not render
      // for anybody. See the comment in `w3hasPlan.ts` for the evidence.
      hasPlan: hasPlanFromWeek(week),

      // REAL weather from /weather/today (buildWeather) — today only. Without a
      // forecast there are no numbers at all, just the honest reason why.
      weather: realWeather ?? {
        window: '—', temp: '—', feels: '—', short: null, verdict: null,
        meta: 'Wetter erscheint, sobald du eine Fahrt mit GPS geloggt hast — dann steht hier dein bestes Fenster für heute.',
        hours: [], bestFrom: null, bestTo: null, peak: null,
      },

      sessionTitle: session ? session.title : null,
      sessionDur: session && session.tss ? `${Math.round((session.tss / 100) * 68)} min` : null,
      sessionTargetW: session?.targetWatts != null ? `${session.targetWatts} W` : '—',
      sessionTss: session?.tss != null ? String(session.tss) : '—',
      sessionFtpPct: session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}%` : '—',
      sessionBlocks: blocks,
      sessionFtpTag: 'FTP',
      // Was a fixture sentence that named no number. RideCoin IS built, and the
      // earn is computable: base = 1 RC per planned TSS (capped at 150), times
      // the rider's real streak multiplier — both ported from
      // `services/rewards.py` in `api/rewards.ts`, so there is one ladder, not
      // a second hand-written one. Labelled as the forecast it is ("bringt ca."),
      // because the session has not been ridden yet, and null on a rest day or
      // an unset session rather than promising RideCoin for nothing.
      sessionEarn: (() => {
        const rc = forecastRideRc(session?.tss ?? null, streak?.streak ?? null)
        if (rc == null) return null
        const mult = streakMultiplier(streak?.streak ?? 0)
        return mult > 1
          ? `Bringt ca. ${rc.toLocaleString('de-DE')} RC · ${formatMultiplier(mult)} Streak`
          : `Bringt ca. ${rc.toLocaleString('de-DE')} RC`
      })(),
    }
  }, [
    model, user, streak, adaptive, week, ftp, todayWeather, weekActs,
    garage, garageLoading, wallet, chest,
    // Without these the memo never re-runs when the collection query lands, and
    // the hero would keep showing the empty state to a rider who owns a bike.
    collectibleArt, collectibleBike,
    // Same reason for the stage: without it a rider swipes to another backdrop,
    // the query updates, and the hero keeps drawing the old one.
    today, selectStage.mutate, selectStage.isPending,
  ])

  // Real adapt that PERSISTS: Easier/Harder/Shorter/Indoor hit POST
  // /workouts/today/modify (the audited workout modifier — writes the new
  // session server-side, safety rails enforced via `rails_downgraded`). On
  // success we invalidate the week + coach-brief caches so the card rebuilds
  // from the persisted session (title/TSS/blocks all refresh). Rest is
  // deterministic (the modifier has no rest type) and never hits the endpoint.
  // A failed/absent modify → null, surfaced as an honest "no plan to adapt".
  const onAdapt = useCallback<OnAdapt>(async (kind) => {
    if (kind === 'rest') return { targetW: '—', tss: 0, ftpPct: '—', rationale: 'Heute komplette Ruhe. Lass die Belastung setzen — der Block morgen trifft dafür härter.', railsDowngraded: false, title: 'Ruhetag' }
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
      rationale: res.title ? `Angepasst — ${res.title}${durTail}` : (res.reason || 'Der Coach hat die Einheit angepasst.'),
      railsDowngraded: res.rails_downgraded ?? false,
      title: res.title ?? null,
    }
  }, [qc])

  // The first-open gate lives in `W3Guard` now (it wraps this route), because
  // it also has to enforce owning a bike — and that check needs the garage
  // query, which does not belong on Today's critical path.

  return (
    <W3TodayView
      vm={vm}
      onAdapt={onAdapt}
      // The swipe hands over to the celebration, which is where the coins
      // actually land. Today's job ends at the gesture.
      onOpenChest={() => chest?.activity_id && navigate(`/e/w3-ride-celebrate/${chest.activity_id}`)}
      onOpenWrapped={() => navigate('/e/w3-wrapped')} />
  )
}

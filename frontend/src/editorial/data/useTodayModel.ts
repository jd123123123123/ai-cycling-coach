import { useMemo } from 'react'
import { useAdaptive } from '../../hooks/useAdaptive'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useMorningHealthCheck } from '../../hooks/useMorningHealthCheck'
import { usePlannedWorkouts } from '../../hooks/usePlannedWorkouts'
import { usePMC } from '../../hooks/usePMC'
import { useRecoveryEta, type RecoveryEta } from '../../hooks/useRecoveryEta'
import { useStreak, type StreakWithConsistency } from '../../hooks/useStreak'
import { useStreamAnalysis } from '../../hooks/useStreamAnalysis'
import { useTodaySession, type TodaySession } from '../../hooks/useTodaySession'
import { useTodaySnapshot } from '../../hooks/useTodaySnapshot'
import { useTodayWeather, type TodayWeather } from '../../hooks/useTodayWeather'
import type { ActivityRead, DailyMetric, PMCResponse, PlannedWorkout, TodaySnapshotResponse } from '../../api/dashboard'
import type { MorningHealthCheck, MorningHealthSignal } from '../../api/health'
import type { CoachBriefResponse } from '../../api/coach'
import type { StreamAnalysis } from '../../api/streamAnalysis'
import type { HrZone } from '../components/ZoneRows'
import type { PeakRow } from '../components/PeakRows'
import { fromNullable, missing, present, type Value } from './value'
import { useDayState } from '../state/useDayState'
import type { DayState } from '../state/dayState'
import { translate, useCopy } from '../i18n/useCopy'
import { EDITORIAL_DEFAULT_LOCALE, intlLocale, type Locale } from '../i18n/copy'

export interface RangeBand { low: number; high: number; position: 'below' | 'in' | 'above' }
export interface PmcPoint { date: string; ctl: number; atl: number; tsb: number; tss?: number | null }
export interface SessionSummary {
  title: string
  targetWatts: number | null
  workKj: number | null
  intensityFactor: number | null
  tss: number | null
  blocks: { label: string; minutes: number; watts: number | null }[]
}
export interface RideSummary {
  activityId: number
  distanceM: number | null
  kj: number | null
  avgHr: number | null
  np: number | null
  durationS: number | null
}
/** One labelled claim in the "what this changes" block — a headline plus the
 *  sentence that grounds it. Both halves are plain strings because the block
 *  as a whole is the Value: either the coach has spoken (both claims exist)
 *  or it hasn't (the whole thing is missing). */
export interface Claim { claim: string; detail: string }

export interface TodayModel {
  state: DayState
  dateLabel: Value<string>
  streakDays: Value<number>
  readiness: Value<{ score: number; deltaVsYesterday: number | null }>
  hrv: Value<{ value: number; unit: 'ms'; delta: number | null; band: RangeBand | null }>
  restingHr: Value<{ value: number; unit: 'bpm'; delta: number | null; band: RangeBand | null }>
  sleep: Value<{ totalS: number; deepS: number | null; remS: number | null; lightS: number | null; awakeS: number | null }>
  pmc: Value<{ fitness: number; fatigue: number; form: number; series: PmcPoint[] }>
  recovery: Value<{ hoursRemaining: number; clearAtLabel: string }>
  /** Resting's Hero Body "Climb" visualisation (`h54Rs`/`z46aUu`, "SINCE YOU
   *  WOKE" — a rising wake→now arc, task 11's genuinely-new material).
   *  Sourced from `useTodaySnapshot()`'s `body_battery: WakeNowPair` — a
   *  real same-day wake vs. current reading, unlike `readiness` (a single
   *  number, no wake/now shape anywhere in the API). Missing whenever
   *  either half of the pair is null — a rising arc drawn from only one end
   *  is not the shape the pen specifies. */
  bodyBattery: Value<{ wake: number; now: number }>
  session: Value<SessionSummary>
  ride: Value<RideSummary>
  /** Time-in-HR-zone with bpm bounds, `01 The Session`'s "HR Zones" block.
   *  Sourced from `useStreamAnalysis(activityId).hr_zones` — the backend
   *  derives bpm bounds from FIXED %-of-max-HR bands, never from
   *  `useTrainingZones` (which carries no heart-rate zones at all). Missing
   *  whenever there is no ride today or the ride has no HR stream — see
   *  task-9-report.md, verify-check 2. */
  zones: Value<HrZone[]>
  /** "Peak Power Today", `01 The Session`. Always missing: no hook anywhere
   *  returns a per-ride power-duration curve — `usePowerProfile()`'s
   *  `peaks`/`mmp_curve` are a sanitized envelope across every stored ride
   *  ever, unscoped to today or to a season. See task-9-report.md,
   *  verify-check 3 (a bigger gap than the brief's own question, which only
   *  asked about the season-best percentage). */
  peaks: Value<PeakRow[]>
  /** Per-block plan-vs-ridden deltas backing `Bars`' delta column. Always
   *  missing: `useStreamAnalysis`'s `splits` are per-kilometre, never
   *  aligned to a named workout block. See task-9-report.md, verify-check 1.
   *  The element type is reserved for a future block-matching source. */
  planVsRidden: Value<{ blockLabel: string; deltaWatts: number }[]>
  verdict: Value<{ headline: string; body: string }>
  /** Two labelled claims — ON YOU / ON THE PLAN — pulled from the brief's
   *  adaptation transparency and post-ride review, never from outlook_7d
   *  (that field is a different claim: tomorrow's suggested TSS). */
  whatThisChanges: Value<{ onYou: Claim; onThePlan: Claim }>
  conditions: Value<{ tempC: number; windKmh: number }>
  /** unlockLabel is its own Value: the session for tomorrow may be known
   *  while its clock time is not — PlannedWorkout carries no time-of-day
   *  field anywhere, so this is honestly missing until a source exists. */
  tomorrow: Value<{ title: string; detail: string; unlockLabel: Value<string> }>
  /** Rest's hero-body "Bars"/"BarLabels" (XD8oR/dfQOB, `RYP0r`) — a 7-bar
   *  Mon-Sun training-load strip, one bar per calendar day of the CURRENT
   *  week. Sourced from `PMCEntry.tss` (`usePMC()`'s raw entries, keyed by
   *  `date`) — a real per-day load number, not derived or estimated. Always
   *  7 entries (never itself a Value: the frame is 7 slots regardless of
   *  data), but each day's `tss` is its own Value — a day with no matching
   *  PMC entry (no ride that day) is honestly missing, never a zero bar. */
  week: { letter: string; tss: Value<number> }[]
  isLoading: boolean
}

export interface TodayModelInputs {
  now: Date
  state: DayState
  snapshot: TodaySnapshotResponse | null | undefined
  yesterdayMetric: DailyMetric | null
  todayMetric: DailyMetric | null
  streak: StreakWithConsistency | null | undefined
  pmc: PMCResponse | null | undefined
  recoveryEta: RecoveryEta | null | undefined
  session: TodaySession | null
  brief: CoachBriefResponse | undefined
  weather: TodayWeather | null | undefined
  activitiesToday: ActivityRead[]
  health: MorningHealthCheck | null | undefined
  tomorrowWorkout: PlannedWorkout | null
  isLoading: boolean
  /** Last 7 days of daily metrics, most-recent-first or unordered — used only
   *  to date the "no wearable reading since ___" reason honestly. Optional:
   *  omitted callers (e.g. unit tests) fall back to 'your last sync'. */
  recentMetrics?: DailyMetric[]
  /** The HRV above/in/below label — the ONE source per the corrected data
   *  map is useAdaptive().hrv_state, never derived from the health signal's
   *  own baseline comparison. Optional: omitted callers get 'unknown'. */
  hrvState?: 'below' | 'in' | 'above' | 'unknown'
  /** Today's ride's stream analysis (splits, HR-zone seconds, GPS, …), used
   *  only for `zones` (`hr_zones.secs` + `hr_zones.max_hr`). Optional:
   *  omitted callers get `zones: missing(...)`, same as no ride/no stream. */
  streamAnalysis?: StreamAnalysis | null
  /** EDITORIAL II's own locale (task 10.6). Resolved by the wrapper hook
   *  below via `useCopy()` and passed in here so `buildTodayModel` itself
   *  stays a pure function — no hook call inside it. Optional: omitted
   *  callers (every existing unit test) get `EDITORIAL_DEFAULT_LOCALE`
   *  ('de'), matching `useCopy`'s own no-provider default. `copy.ts`'s
   *  `translate()` is a plain function, not a hook, so calling it from this
   *  pure builder with an explicit locale is safe and fully deterministic —
   *  the same inputs always produce the same reason strings, which is what
   *  keeps this function unit-testable without React at all. */
  locale?: Locale
}

function lastReadingLabel(now: Date, recentMetrics: DailyMetric[] | undefined, locale: Locale): string {
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const candidates = (recentMetrics ?? [])
    .filter((m) => m.date != null)
    .map((m) => new Date(`${m.date}T00:00:00`))
    .filter((d) => d >= sevenDaysAgo && d <= now)
    .sort((a, b) => b.getTime() - a.getTime())
  const mostRecent = candidates[0]
  if (!mostRecent) return translate(locale, 'wearableLastSyncFallback')
  return mostRecent.toLocaleDateString(intlLocale(locale), { weekday: 'long' })
}

function wearableMissingReason(now: Date, recentMetrics: DailyMetric[] | undefined, locale: Locale): string {
  return translate(locale, 'wearableMissingSince', { day: lastReadingLabel(now, recentMetrics, locale) })
}

function buildRangeBand(
  signal: MorningHealthSignal | undefined,
  positionOverride?: 'below' | 'in' | 'above' | 'unknown',
): RangeBand | null {
  if (!signal || signal.series.length === 0) return null
  const low = Math.min(...signal.series)
  const high = Math.max(...signal.series)
  let position: 'below' | 'in' | 'above'
  if (positionOverride && positionOverride !== 'unknown') {
    position = positionOverride
  } else if (signal.baseline == null || signal.value === signal.baseline) {
    position = 'in'
  } else {
    position = signal.value < signal.baseline ? 'below' : 'above'
  }
  return { low, high, position }
}

/** Pure assembly — no hooks, fully unit-testable. Every field is a Value<T>. */
export function buildTodayModel(inputs: TodayModelInputs): TodayModel {
  const { now, state, snapshot, yesterdayMetric, todayMetric, streak, pmc, recoveryEta,
    session, brief, weather, activitiesToday, health, tomorrowWorkout, isLoading, recentMetrics, hrvState,
    streamAnalysis, locale = EDITORIAL_DEFAULT_LOCALE } = inputs
  const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate(locale, key, vars)

  const dateLabel = present(
    now.toLocaleDateString(intlLocale(locale), { weekday: 'short', day: '2-digit', month: 'short' })
      .toUpperCase()
      .replace(/[.,]/g, ''),
  )

  const streakDays = fromNullable(streak?.streak ?? null, t('streakMissing'))

  const todayReadiness = snapshot?.training_readiness ?? null
  const readiness = fromNullable(
    todayReadiness === null ? null : {
      score: todayReadiness,
      deltaVsYesterday: yesterdayMetric?.training_readiness != null
        ? todayReadiness - yesterdayMetric.training_readiness
        : null,
    },
    t('readinessMissing'),
  )

  const wearableReason = wearableMissingReason(now, recentMetrics, locale)

  const hrvSignal = health?.signals.find((s) => s.metric === 'hrv')
  const hrv = fromNullable(
    snapshot?.hrv_overnight_avg == null ? null : {
      value: snapshot.hrv_overnight_avg,
      unit: 'ms' as const,
      delta: hrvSignal?.delta ?? null,
      band: buildRangeBand(hrvSignal, hrvState),
    },
    wearableReason,
  )

  const restingHrSignal = health?.signals.find((s) => s.metric === 'resting_hr')
  const restingHr = fromNullable(
    todayMetric?.resting_hr == null ? null : {
      value: todayMetric.resting_hr,
      unit: 'bpm' as const,
      delta: restingHrSignal?.delta ?? null,
      band: buildRangeBand(restingHrSignal),
    },
    wearableReason,
  )

  const sleepDetail = todayMetric?.sleep_detail ?? null
  const sleep = fromNullable(
    sleepDetail == null || sleepDetail.total_s == null ? null : {
      totalS: sleepDetail.total_s,
      deepS: sleepDetail.deep_s,
      remS: sleepDetail.rem_s,
      lightS: sleepDetail.light_s,
      awakeS: sleepDetail.awake_s,
    },
    wearableReason,
  )

  const pmcEntries = pmc?.entries ?? []
  const latestPmc = pmcEntries[pmcEntries.length - 1] ?? null
  const pmcValue = fromNullable(
    latestPmc == null ? null : {
      fitness: latestPmc.ctl,
      fatigue: latestPmc.atl,
      form: latestPmc.tsb,
      series: pmcEntries.map((e) => ({ date: e.date, ctl: e.ctl, atl: e.atl, tsb: e.tsb, tss: e.tss ?? null })),
    },
    t('pmcMissing'),
  )

  const recoveryHours = snapshot?.recovery_time_hours ?? null
  const recovery = fromNullable(
    recoveryHours == null ? null : (() => {
      if (recoveryEta?.already_fresh) {
        return { hoursRemaining: 0, clearAtLabel: t('recoveryFreshNow') }
      }
      const clearAt = new Date(snapshot!.generated_at)
      clearAt.setHours(clearAt.getHours() + recoveryHours)
      const clearAtLabel = `${clearAt.toLocaleDateString(intlLocale(locale), { weekday: 'short' })} ${clearAt.toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit' })}`
      return { hoursRemaining: recoveryHours, clearAtLabel }
    })(),
    t('recoveryMissing'),
  )

  const bbPair = snapshot?.body_battery ?? null
  const bodyBattery = fromNullable(
    bbPair && bbPair.wake != null && bbPair.now != null ? { wake: bbPair.wake, now: bbPair.now } : null,
    wearableReason,
  )

  const workout = session?.workout ?? null
  const sessionValue = fromNullable(
    workout == null ? null : (() => {
      const blocks = workout.blocks.map((b) => ({
        label: b.name,
        minutes: b.duration_s / 60,
        watts: b.target_watts_high ?? b.target_watts_low ?? null,
      }))
      const uniformWatts = blocks.length > 0 && blocks.every((b) => b.watts === blocks[0].watts) ? blocks[0].watts : null
      const durHr = workout.duration_minutes / 60
      const intensityFactor = durHr > 0 && workout.predicted_tss != null
        ? Math.sqrt(workout.predicted_tss / (durHr * 100))
        : null
      return {
        title: workout.title,
        targetWatts: uniformWatts,
        workKj: null,
        intensityFactor,
        tss: workout.predicted_tss ?? null,
        blocks,
      }
    })(),
    t('sessionMissing'),
  )

  const NO_RIDE_REASON = t('rideMissing')
  const rideActivity = activitiesToday.find((a) => a.sport === 'cycling') ?? null
  const ride = fromNullable(
    rideActivity == null ? null : {
      activityId: rideActivity.id,
      distanceM: rideActivity.distance_meters,
      // kJ = W · s / 1000 is the DEFINITION of mechanical work, not an
      // estimate — this is exactly how a head unit derives the number from
      // average power and duration. Never fall back to calories (a
      // different, physiologically-derived quantity); missing whenever
      // average_power is null rather than padding with an approximation.
      kj: rideActivity.average_power != null && rideActivity.duration_seconds != null
        ? Math.round((rideActivity.average_power * rideActivity.duration_seconds) / 1000)
        : null,
      avgHr: rideActivity.average_hr,
      np: rideActivity.normalized_power,
      durationS: rideActivity.duration_seconds,
    },
    NO_RIDE_REASON,
  )

  // Time-in-HR-zone with real bpm bounds (task-9-report.md, verify-check 2):
  // the backend computes `hr_zones.secs` from fixed %-of-max-HR bands over
  // `hr_zones.max_hr` (`_hr_zones`, activity_stream_analysis.py — bounds
  // 60/70/80/90%), so bpm bounds are derivable whenever a ride's stream
  // carries HR data. `useTrainingZones` plays no part: it has no
  // heart-rate zones at all, only power/pace.
  const HR_ZONE_FRACTIONS = [0, 0.6, 0.7, 0.8, 0.9, Infinity]
  const zones: Value<HrZone[]> = rideActivity == null
    ? missing(NO_RIDE_REASON)
    : streamAnalysis?.hr_zones == null
      ? missing(t('zonesNoHrData'))
      : present(['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map((name, i) => ({
        name,
        lowBpm: Math.round(HR_ZONE_FRACTIONS[i] * streamAnalysis.hr_zones!.max_hr),
        highBpm: Number.isFinite(HR_ZONE_FRACTIONS[i + 1])
          ? Math.round(HR_ZONE_FRACTIONS[i + 1] * streamAnalysis.hr_zones!.max_hr)
          : Infinity,
        seconds: streamAnalysis.hr_zones!.secs[i] ?? 0,
      })))

  // "Peak Power Today" (task-9-report.md, verify-check 3): no hook returns
  // a per-ride power-duration curve. usePowerProfile()'s peaks/mmp_curve
  // are an all-time envelope across every stored ride, never scoped to
  // today or to a season — always missing, matching the Insight Strip's
  // own "PEAK POWER" gap (TodayView.tsx, task 8).
  const peaks: Value<PeakRow[]> = missing(t('peaksMissing'))

  // Plan-vs-ridden per-block deltas (task-9-report.md, verify-check 1):
  // useStreamAnalysis's splits are per-kilometre, never aligned to a named
  // workout block — always missing.
  const planVsRidden: Value<{ blockLabel: string; deltaWatts: number }[]> = missing(
    t('planVsRiddenMissing'),
  )

  const verdict = fromNullable(
    brief == null ? null : {
      headline: brief.verdict,
      body: brief.rationale,
    },
    t('verdictMissing'),
  )

  // ON YOU / ON THE PLAN — pulled from adaptations ("what changed & why" —
  // the plan side) and the post-ride review (the physiological side), never
  // from outlook_7d (a different claim entirely: tomorrow's suggested TSS).
  const adaptations = brief?.adaptations ?? null
  const postRideReview = brief?.post_ride_review ?? null
  const whatThisChanges = fromNullable(
    adaptations == null && postRideReview == null ? null : {
      onYou: {
        claim: postRideReview?.physiological_read ?? adaptations!.summary,
        detail: postRideReview?.goal_trajectory ?? adaptations!.changes[0]?.detail ?? adaptations!.summary,
      },
      onThePlan: {
        claim: adaptations?.summary ?? postRideReview!.next_session_nudge,
        detail: postRideReview?.next_session_nudge
          ?? adaptations!.changes[0]?.detail
          ?? adaptations!.summary,
      },
    },
    t('whatThisChangesMissing'),
  )

  const weatherReason = t('weatherMissing')
  const currentHour = weather?.available
    ? (weather.hours.find((h) => new Date(h.time).getTime() >= now.getTime()) ?? weather.hours[0] ?? null)
    : null
  const conditions = fromNullable(
    weather?.available && currentHour && currentHour.temp_c != null && currentHour.wind_kmh != null
      ? { tempC: currentHour.temp_c, windKmh: currentHour.wind_kmh }
      : null,
    weatherReason,
  )

  const tomorrow = fromNullable(
    tomorrowWorkout == null ? null : {
      title: tomorrowWorkout.title,
      detail: brief?.tomorrow_plan?.description ?? tomorrowWorkout.description ?? '',
      // No source anywhere: PlannedWorkout carries only `date`, no
      // time-of-day field. Honestly missing until a real source exists —
      // never assert a schedule the app does not have.
      unlockLabel: missing<string>(t('tomorrowUnlockMissing')),
    },
    t('tomorrowMissing'),
  )

  // Rest's Mon-Sun training-load strip (WeekRail, `RYP0r`'s "Bars"/
  // "BarLabels"). Built from the current calendar week (Monday-start,
  // matching the frame's own M/T/W/T/F/S/S label row) against the raw PMC
  // entries' own `tss` field — real per-day load, keyed by date. A day
  // with no matching entry is honestly missing, never a synthesised zero.
  const DOW_LETTER_KEYS = ['weekMon', 'weekTue', 'weekWed', 'weekThu', 'weekFri', 'weekSat', 'weekSun'] as const
  const mondayOffset = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - mondayOffset)
  const week = DOW_LETTER_KEYS.map((letterKey, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = toIsoDate(d)
    const entry = pmcEntries.find((e) => e.date === iso)
    return {
      letter: t(letterKey),
      tss: entry?.tss != null ? present(entry.tss) : missing<number>(t('weekDayNoRide')),
    }
  })

  return {
    state,
    dateLabel,
    streakDays,
    readiness,
    hrv,
    restingHr,
    sleep,
    pmc: pmcValue,
    recovery,
    bodyBattery,
    session: sessionValue,
    ride,
    zones,
    peaks,
    planVsRidden,
    verdict,
    whatThisChanges,
    conditions,
    tomorrow,
    week,
    isLoading,
  }
}

/** Assembles inputs from the live hooks and returns the pure model. */
export function useTodayModel(): TodayModel {
  const { state } = useDayState()
  const { locale } = useCopy()
  const now = useMemo(() => new Date(), [])
  const yesterday = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() - 1); return d }, [now])
  const sevenDaysAgo = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() - 7); return d }, [now])
  const tomorrow = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() + 1); return d }, [now])

  const snapshotQuery = useTodaySnapshot()
  const yesterdayMetricsQuery = useDailyMetrics(yesterday, yesterday)
  const recentMetricsQuery = useDailyMetrics(sevenDaysAgo, now)
  const streakQuery = useStreak()
  const pmcQuery = usePMC()
  const recoveryEtaQuery = useRecoveryEta()
  const session = useTodaySession()
  const briefQuery = useCoachBrief()
  const weatherQuery = useTodayWeather()
  const activitiesQuery = useActivitiesRange(now, now)
  const healthQuery = useMorningHealthCheck()
  const tomorrowWorkoutsQuery = usePlannedWorkouts(tomorrow, tomorrow)
  const adaptiveQuery = useAdaptive()

  const todayRideActivityId = activitiesQuery.data?.activities.find((a) => a.sport === 'cycling')?.id
  const streamAnalysisQuery = useStreamAnalysis(todayRideActivityId)

  const todayMetric = recentMetricsQuery.data?.metrics.find((m) => {
    if (m.date == null) return false
    return m.date === toIsoDate(now)
  }) ?? null

  const isLoading = snapshotQuery.isLoading || recentMetricsQuery.isLoading || streakQuery.isLoading
    || pmcQuery.isLoading || briefQuery.isLoading || weatherQuery.isLoading
    || activitiesQuery.isLoading || healthQuery.isLoading

  const inputs: TodayModelInputs = {
    now,
    state,
    snapshot: snapshotQuery.data,
    yesterdayMetric: yesterdayMetricsQuery.data?.metrics[0] ?? null,
    todayMetric,
    streak: streakQuery.data,
    pmc: pmcQuery.data,
    recoveryEta: recoveryEtaQuery.data,
    session,
    brief: briefQuery.data,
    weather: weatherQuery.data,
    activitiesToday: activitiesQuery.data?.activities ?? [],
    health: healthQuery.data,
    tomorrowWorkout: tomorrowWorkoutsQuery.data?.planned_workouts[0] ?? null,
    isLoading,
    recentMetrics: recentMetricsQuery.data?.metrics,
    hrvState: adaptiveQuery.data?.hrv_state,
    streamAnalysis: streamAnalysisQuery.data,
    locale,
  }

  return buildTodayModel(inputs)
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

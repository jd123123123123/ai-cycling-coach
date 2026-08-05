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
import { useTodaySession, type TodaySession } from '../../hooks/useTodaySession'
import { useTodaySnapshot } from '../../hooks/useTodaySnapshot'
import { useTodayWeather, type TodayWeather } from '../../hooks/useTodayWeather'
import type { ActivityRead, DailyMetric, PMCResponse, PlannedWorkout, TodaySnapshotResponse } from '../../api/dashboard'
import type { MorningHealthCheck, MorningHealthSignal } from '../../api/health'
import type { CoachBriefResponse } from '../../api/coach'
import { fromNullable, isPresent, present, type Value } from './value'
import { useDayState } from '../state/useDayState'
import type { DayState } from '../state/dayState'

export interface RangeBand { low: number; high: number; position: 'below' | 'in' | 'above' }
export interface PmcPoint { date: string; ctl: number; atl: number; tsb: number }
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
  session: Value<SessionSummary>
  ride: Value<RideSummary>
  verdict: Value<{ headline: string; body: string; whatThisChanges: string | null }>
  conditions: Value<{ tempC: number; windKmh: number }>
  tomorrow: Value<{ title: string; unlockLabel: string }>
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
}

const NO_WEARABLE_FALLBACK = 'your last sync'

function lastReadingLabel(now: Date, recentMetrics: DailyMetric[] | undefined): string {
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const candidates = (recentMetrics ?? [])
    .filter((m) => m.date != null)
    .map((m) => new Date(`${m.date}T00:00:00`))
    .filter((d) => d >= sevenDaysAgo && d <= now)
    .sort((a, b) => b.getTime() - a.getTime())
  const mostRecent = candidates[0]
  if (!mostRecent) return NO_WEARABLE_FALLBACK
  return mostRecent.toLocaleDateString('en-GB', { weekday: 'long' })
}

function wearableMissingReason(now: Date, recentMetrics: DailyMetric[] | undefined): string {
  return `No wearable reading since ${lastReadingLabel(now, recentMetrics)}.`
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
    session, brief, weather, activitiesToday, health, tomorrowWorkout, isLoading, recentMetrics, hrvState } = inputs

  const dateLabel = present(
    now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace(/,/g, ''),
  )

  const streakDays = fromNullable(streak?.streak ?? null, 'No streak recorded yet.')

  const todayReadiness = snapshot?.training_readiness ?? null
  const readiness = fromNullable(
    todayReadiness === null ? null : {
      score: todayReadiness,
      deltaVsYesterday: yesterdayMetric?.training_readiness != null
        ? todayReadiness - yesterdayMetric.training_readiness
        : null,
    },
    'No readiness reading yet.',
  )

  const wearableReason = wearableMissingReason(now, recentMetrics)

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
      series: pmcEntries.map((e) => ({ date: e.date, ctl: e.ctl, atl: e.atl, tsb: e.tsb })),
    },
    'Not enough training history yet.',
  )

  const recoveryHours = snapshot?.recovery_time_hours ?? null
  const recovery = fromNullable(
    recoveryHours == null ? null : (() => {
      if (recoveryEta?.already_fresh) {
        return { hoursRemaining: 0, clearAtLabel: 'Fresh now' }
      }
      const clearAt = new Date(snapshot!.generated_at)
      clearAt.setHours(clearAt.getHours() + recoveryHours)
      const clearAtLabel = `${clearAt.toLocaleDateString('en-GB', { weekday: 'short' })} ${clearAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
      return { hoursRemaining: recoveryHours, clearAtLabel }
    })(),
    'No recovery estimate yet.',
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
    'Nothing planned for today.',
  )

  const rideActivity = activitiesToday.find((a) => a.sport === 'cycling') ?? null
  const ride = fromNullable(
    rideActivity == null ? null : {
      activityId: rideActivity.id,
      distanceM: rideActivity.distance_meters,
      kj: rideActivity.average_power != null && rideActivity.duration_seconds != null
        ? Math.round((rideActivity.average_power * rideActivity.duration_seconds) / 1000)
        : null,
      avgHr: rideActivity.average_hr,
      np: rideActivity.normalized_power,
      durationS: rideActivity.duration_seconds,
    },
    'No ride recorded yet today.',
  )

  const verdict = fromNullable(
    brief == null ? null : {
      headline: brief.verdict,
      body: brief.rationale,
      whatThisChanges: brief.outlook_7d?.find((o) => o.day_offset === 1)?.note ?? null,
    },
    'The coach has not weighed in yet today.',
  )

  const weatherReason = 'No location from a recent ride.'
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
      unlockLabel: isPresent(recovery) ? `Unlocks ${recovery.value.clearAtLabel}` : 'Unlocks tomorrow',
    },
    "Tomorrow's plan is not set yet.",
  )

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
    session: sessionValue,
    ride,
    verdict,
    conditions,
    tomorrow,
    isLoading,
  }
}

/** Assembles inputs from the live hooks and returns the pure model. */
export function useTodayModel(): TodayModel {
  const { state } = useDayState()
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

  const todayMetric = recentMetricsQuery.data?.metrics.find((m) => {
    if (m.date == null) return false
    return m.date === toIsoDate(now)
  }) ?? null

  const isLoading = snapshotQuery.isLoading || recentMetricsQuery.isLoading || streakQuery.isLoading
    || pmcQuery.isLoading || session.brief === undefined || weatherQuery.isLoading
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
  }

  return buildTodayModel(inputs)
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

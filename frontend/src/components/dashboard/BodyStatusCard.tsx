import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import type { DailyMetric } from '../../api/dashboard'

// ---------------------------------------------------------------------------
// MetricTile sub-component
// ---------------------------------------------------------------------------

interface MetricTileProps {
  label: string
  value: number | null
  unit: string
  good: number   // value >= good → green
  warn: number   // value < warn → red; between → yellow; null → gray
}

function MetricTile({ label, value, unit, good, warn }: MetricTileProps) {
  let dotClass = 'bg-gray-300'
  if (value !== null) {
    if (value >= good) dotClass = 'bg-green-500'
    else if (value < warn) dotClass = 'bg-red-500'
    else dotClass = 'bg-yellow-400'
  }

  return (
    <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
        <span className="text-xs text-gray-500 truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">
          {value !== null ? value : '—'}
        </span>
        {value !== null && (
          <span className="text-xs text-gray-400">{unit}</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReadinessRing sub-component
// ---------------------------------------------------------------------------

interface ReadinessRingProps {
  score: number  // 0-100
}

function ReadinessRing({ score }: ReadinessRingProps) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const filled = (score / 100) * circumference
  const gap = circumference - filled

  let ringColor = '#ef4444'  // red
  if (score >= 70) ringColor = '#22c55e'       // green
  else if (score >= 40) ringColor = '#facc15'  // yellow

  return (
    <div className="flex flex-col items-center justify-center gap-1 min-w-0">
      <svg width="80" height="80" viewBox="0 0 80 80" aria-label={`Readiness ${score}%`}>
        {/* Background ring */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        {/* Filled ring — starts at 12 o'clock */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${gap}`}
          transform="rotate(-90 40 40)"
        />
        <text
          x="40"
          y="44"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="#111827"
        >
          {score}
        </text>
      </svg>
      <span className="text-xs text-gray-500">Readiness</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composite readiness calculation
// ---------------------------------------------------------------------------

/**
 * Compute composite readiness score 0-100.
 * Formula: 0.4*hrv_norm + 0.35*body_battery + 0.25*sleep_score
 * Null metrics get weight 0; remaining weights are renormalized.
 * Returns null if all three metrics are null.
 */
function computeReadiness(
  hrv: number | null,
  bodyBattery: number | null,
  sleepScore: number | null,
): number | null {
  // Normalize hrv to 0-100 range (Garmin returns ~30-100ms; clamp to [0,100])
  const hrvNorm = hrv !== null ? Math.max(0, Math.min(100, hrv)) : null

  const weights = { hrv: 0.4, battery: 0.35, sleep: 0.25 }
  const values = { hrv: hrvNorm, battery: bodyBattery, sleep: sleepScore }

  // Zero out weights for null metrics
  let totalWeight = 0
  let weightedSum = 0

  if (values.hrv !== null) {
    totalWeight += weights.hrv
    weightedSum += weights.hrv * values.hrv
  }
  if (values.battery !== null) {
    totalWeight += weights.battery
    weightedSum += weights.battery * values.battery
  }
  if (values.sleep !== null) {
    totalWeight += weights.sleep
    weightedSum += weights.sleep * values.sleep
  }

  if (totalWeight === 0) return null  // all-null

  // Renormalize
  return Math.round(weightedSum / totalWeight)
}

// ---------------------------------------------------------------------------
// Skeleton loading state
// ---------------------------------------------------------------------------

function SkeletonTile() {
  return <div className="bg-gray-100 rounded-xl h-20 animate-pulse" />
}

// ---------------------------------------------------------------------------
// Main BodyStatusCard export
// ---------------------------------------------------------------------------

export default function BodyStatusCard() {
  const today = new Date()
  const threeDaysAgo = subDays(today, 3)

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch,
  } = useDailyMetrics(threeDaysAgo, today)

  const { data: garminData, isLoading: garminLoading } = useGarminStatus()

  const isLoading = metricsLoading || garminLoading

  // --------------- Loading state ---------------
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="h-6 w-28 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </div>
      </div>
    )
  }

  // --------------- Error state ---------------
  if (metricsError) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Body Status</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Couldn't load body status</span>
          <button
            onClick={() => void refetch()}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // --------------- Garmin not connected ---------------
  if (garminData && !garminData.connected) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Body Status</h2>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-blue-800">
            Connect Garmin to see your body status
          </p>
          <Link
            to="/garmin/connect"
            className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors min-h-[44px]"
          >
            Connect Garmin
          </Link>
        </div>
      </div>
    )
  }

  // --------------- Find most recent metric with data ---------------
  const metrics: DailyMetric[] = metricsData?.metrics ?? []
  // Sorted ascending by date; pick last entry with at least one bio metric
  const latestMetric = [...metrics]
    .reverse()
    .find(
      (m) =>
        m.sleep_score !== null || m.hrv_status !== null || m.body_battery !== null,
    ) ?? null

  // --------------- All-metrics-null state ---------------
  if (!latestMetric) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Body Status</h2>
        <p className="text-sm text-gray-400">
          No metrics yet — your next sync will populate this
        </p>
      </div>
    )
  }

  // --------------- Populated state ---------------
  const readiness = computeReadiness(
    latestMetric.hrv_status,
    latestMetric.body_battery,
    latestMetric.sleep_score,
  )

  const metricDate = latestMetric.date ? new Date(latestMetric.date) : today

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900">Body Status</h2>
        <span className="text-xs text-gray-400">{format(metricDate, 'EEEE, MMMM d')}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        {/* Readiness ring — first cell */}
        <div className="flex items-center justify-center">
          {readiness !== null ? (
            <ReadinessRing score={readiness} />
          ) : (
            <div className="text-xs text-gray-400 text-center">
              No readiness data
            </div>
          )}
        </div>

        <MetricTile
          label="Sleep Score"
          value={latestMetric.sleep_score}
          unit="/ 100"
          good={80}
          warn={60}
        />
        <MetricTile
          label="HRV"
          value={latestMetric.hrv_status !== null ? Math.round(latestMetric.hrv_status) : null}
          unit="ms"
          good={60}
          warn={40}
        />
        <MetricTile
          label="Body Battery"
          value={latestMetric.body_battery}
          unit="/ 100"
          good={60}
          warn={30}
        />
      </div>
    </div>
  )
}

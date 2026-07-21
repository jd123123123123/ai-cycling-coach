import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

/**
 * GET /analytics/season-trends — the four season-long monthly series the
 * Progress surface (BikeProgressView) aggregates from already-stored data:
 *
 *   • vo2max        — Garmin's VO₂max estimate (daily_metric.raw_data)
 *   • weight_kg     — the daily body-weight series (daily_metric.weight_kg)
 *   • durability_pct — per-ride aerobic decoupling (activity_stream.decoupling_pct)
 *   • p20min_w      — best 20-min mean-max power (activity_stream.mmp_curve[1200])
 *
 * Every value is the athlete's own, aggregated into monthly buckets. A metric
 * with no stored data for this athlete comes back with n_points === 0 and null
 * points — the UI then keeps an honest empty state, never a fabricated line.
 */
export interface TrendPoint {
  month: string
  month_en: string
  month_de: string
  vo2max: number | null
  weight_kg: number | null
  durability_pct: number | null
  p20min_w: number | null
}

export interface MetricSummary {
  first: number | null
  latest: number | null
  delta: number | null
  n_points: number
  lower_is_better: boolean
}

export interface SeasonTrends {
  available: boolean
  year: number
  points: TrendPoint[]
  vo2max: MetricSummary
  weight_kg: MetricSummary
  durability_pct: MetricSummary
  p20min_w: MetricSummary
}

export function useSeasonTrends(year?: number) {
  return useQuery<SeasonTrends>({
    queryKey: ['analytics', 'season-trends', year ?? 'current'],
    queryFn: async () =>
      (
        await apiClient.get<SeasonTrends>(
          `/analytics/season-trends${year ? `?year=${year}` : ''}`,
        )
      ).data,
  })
}

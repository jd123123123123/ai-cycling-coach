import { apiClient } from './client'

// Mirrors backend app/schemas/session_report.py — the per-activity
// "rated against the prescription" payload.

export type Sentiment = 'good' | 'caution' | 'bad' | 'neutral'
export type Band = 'match' | 'over' | 'under'

export interface SessionKPI {
  key: string
  label: string
  target_display: string
  actual_display: string
  delta_display: string
  delta_pct: number
  band: Band
  sentiment: Sentiment
}

export interface SessionReadItem {
  tone: 'up' | 'ok' | 'down'
  title: string
  detail: string
}

export interface NextSession {
  label: string
  headline: string
  detail: string
}

export interface DetailMetric {
  label: string
  value: string
  unit: string | null
}

export interface SessionReport {
  activity_id: number
  title: string
  sport: string
  date: string
  distance_km: number | null
  duration_minutes: number
  grade: string | null
  grade_score: number
  headline: string
  prescribed_title: string | null
  kpis: SessionKPI[]
  reads: SessionReadItem[]
  next_session: NextSession | null
  detail_metrics: DetailMetric[]
  debrief_available: boolean
  lang: string
}

export async function fetchSessionReport(
  activityId: number,
  lang: string,
): Promise<SessionReport> {
  const { data } = await apiClient.get<SessionReport>(
    `/analytics/activities/${activityId}/session-report`,
    { params: { lang } },
  )
  return data
}

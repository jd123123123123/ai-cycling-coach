import { apiClient } from './client'

export interface DailyMetric {
  id: number
  user_id: number
  date: string | null         // ISO yyyy-mm-dd
  recorded_at: string         // ISO datetime
  sleep_score: number | null
  hrv_status: number | null
  body_battery: number | null
  resting_hr: number | null
  stress_level: number | null
  steps: number | null
  weight_kg: number | null
  source: string | null
}

export interface DailyMetricListResponse {
  metrics: DailyMetric[]
  count: number
}

export interface ActivityRead {
  id: number
  started_at: string
  user_id: number
  sport: 'cycling' | 'running' | 'gym'
  duration_seconds: number | null
  distance_meters: number | null
  tss: number | null
  title: string | null
  source: string | null
}

export interface ActivityListResponse {
  activities: ActivityRead[]
  count: number
}

export interface PMCEntry {
  date: string                 // ISO yyyy-mm-dd
  ctl: number
  atl: number
  tsb: number
  daily_tss: number
}

export interface PMCResponse {
  entries: PMCEntry[]
  per_sport: { cycling: PMCEntry[]; running: PMCEntry[]; gym: PMCEntry[] }
}

export interface GarminStatus {
  connected: boolean
  sync_enabled: boolean | null
  last_sync_at: string | null
  sync_status: 'ok' | 'auth_error' | 'syncing' | 'error' | null
}

function toIsoDate(d: Date): string {
  // Local date as yyyy-mm-dd (not UTC — matches backend's `date` type)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function fetchDailyMetrics(start: Date, end: Date): Promise<DailyMetricListResponse> {
  const res = await apiClient.get<DailyMetricListResponse>('/daily-metrics', {
    params: { start_date: toIsoDate(start), end_date: toIsoDate(end) },
  })
  return res.data
}

export async function fetchActivitiesRange(start: Date, end: Date): Promise<ActivityListResponse> {
  // /activities expects ISO 8601 datetimes — use start-of-day / end-of-day
  const startIso = new Date(start); startIso.setHours(0, 0, 0, 0)
  const endIso = new Date(end); endIso.setHours(23, 59, 59, 999)
  const res = await apiClient.get<ActivityListResponse>('/activities', {
    params: { start_date: startIso.toISOString(), end_date: endIso.toISOString(), limit: 500 },
  })
  return res.data
}

export async function fetchPMC(days = 90): Promise<PMCResponse> {
  const res = await apiClient.get<PMCResponse>('/training-load/pmc', { params: { days } })
  return res.data
}

export async function fetchGarminStatus(): Promise<GarminStatus> {
  const res = await apiClient.get<GarminStatus>('/garmin/status')
  return res.data
}

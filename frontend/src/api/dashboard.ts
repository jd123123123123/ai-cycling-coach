import { apiClient } from './client'
import type { IntervalStructure } from '../types/workoutInterval'

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
  average_hr: number | null
  normalized_power: number | null
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
  narrative?: string | null    // Plain-English per-day summary shown in hover tooltip
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

export async function fetchPMC(
  days = 90,
  language: 'simple' | 'technical' = 'simple',
): Promise<PMCResponse> {
  const res = await apiClient.get<PMCResponse>('/training-load/pmc', {
    params: { days, language },
  })
  return res.data
}

export async function fetchGarminStatus(): Promise<GarminStatus> {
  const res = await apiClient.get<GarminStatus>('/garmin/status')
  return res.data
}

// ─── Intraday samples ─────────────────────────────────────────────────────────

export interface IntradayPoint {
  t: string   // ISO utc timestamp
  v: number
}

export interface IntradayDayResponse {
  date: string
  body_battery: IntradayPoint[]
  stress: IntradayPoint[]
  hrv: IntradayPoint[]
  hr: IntradayPoint[]
  fetched_live: boolean
}

export async function fetchIntraday(iso: string): Promise<IntradayDayResponse> {
  const res = await apiClient.get<IntradayDayResponse>(`/daily-metrics/${iso}/intraday`, {
    timeout: 20_000,
  })
  return res.data
}

// ─── Planned Workouts ─────────────────────────────────────────────────────────

export interface PlannedWorkout {
  id: number
  user_id: number
  date: string                 // ISO yyyy-mm-dd
  sport: 'cycling' | 'running' | 'gym'
  title: string
  duration_seconds_target: number | null
  description: string | null
  interval_structure: IntervalStructure | null
  created_at: string
}

export interface PlannedWorkoutListResponse {
  planned_workouts: PlannedWorkout[]
  count: number
}

export interface PlannedWorkoutCreateBody {
  date: string                 // yyyy-mm-dd
  sport: 'cycling' | 'running' | 'gym'
  title: string
  duration_seconds_target?: number | null
  description?: string | null
  interval_structure?: PlannedWorkout['interval_structure']
}

export interface PlannedWorkoutUpdateBody {
  date?: string
  sport?: 'cycling' | 'running' | 'gym'
  title?: string
  duration_seconds_target?: number | null
  description?: string | null
  interval_structure?: PlannedWorkout['interval_structure']
}

export async function fetchPlannedWorkouts(start: Date, end: Date): Promise<PlannedWorkoutListResponse> {
  const res = await apiClient.get<PlannedWorkoutListResponse>('/planned-workouts', {
    params: { start_date: toIsoDate(start), end_date: toIsoDate(end) },
  })
  return res.data
}

export async function createPlannedWorkout(body: PlannedWorkoutCreateBody): Promise<PlannedWorkout> {
  const res = await apiClient.post<PlannedWorkout>('/planned-workouts', body)
  return res.data
}

export async function updatePlannedWorkout(id: number, body: PlannedWorkoutUpdateBody): Promise<PlannedWorkout> {
  const res = await apiClient.patch<PlannedWorkout>(`/planned-workouts/${id}`, body)
  return res.data
}

export async function deletePlannedWorkout(id: number): Promise<void> {
  await apiClient.delete(`/planned-workouts/${id}`)
}

import { apiClient } from './client'

export interface WorkoutRep {
  activity_id: number
  date: string
  duration_s: number | null
  distance_m: number | null
  tss: number | null
  avg_power: number | null
  normalized_power: number | null
  avg_hr: number | null
  max_hr: number | null
  efficiency_factor: number | null
  pace_s_per_km: number | null
}

export interface WorkoutTrend {
  metric: string
  series: number[]
  first: number | null
  last: number | null
  delta: number | null
  pct: number | null
  improving: boolean | null
}

export interface Headline {
  text: string
  tone: 'good' | 'bad' | 'neutral'
}

export interface WorkoutGroupSummary {
  key: string
  title: string
  sport: string
  count: number
  first_date: string
  last_date: string
  headline: Headline
}

export interface WorkoutGroupDetail {
  key: string
  title: string
  sport: string
  reps: WorkoutRep[]
  trends: WorkoutTrend[]
}

export async function listWorkouts(): Promise<WorkoutGroupSummary[]> {
  const res = await apiClient.get<WorkoutGroupSummary[]>('/workouts')
  return res.data
}

export async function getWorkout(key: string): Promise<WorkoutGroupDetail> {
  const res = await apiClient.get<WorkoutGroupDetail>(`/workouts/${encodeURIComponent(key)}`)
  return res.data
}

export interface AthleteProfile {
  id: number
  user_id: number
  ftp_watts: number | null
  weight_kg: number | null
  max_heart_rate: number | null
  resting_heart_rate: number | null
  weekly_hours_available: number | null
  primary_sport: string | null
  date_of_birth: string | null
  lthr_cycling: number | null
  lthr_running: number | null
  running_threshold_pace_ms: number | null
  secondary_sports: string[] | null
  goals: TrainingGoals | null
  ftp_history: unknown[] | null
  // Phase 7 periodization engine — first-class target event fields
  target_event_date: string | null   // ISO date YYYY-MM-DD
  target_event_type: 'race' | 'fondo' | 'audax' | 'maintenance' | null
  target_priority: 'A' | 'B' | 'C' | null
  created_at: string
  updated_at: string | null
}

export interface TrainingGoals {
  target_ftp?: number
  target_event_name?: string
  target_event_date?: string
  weekly_hours?: number
}

export interface AthleteProfileUpdate {
  ftp_watts?: number
  weight_kg?: number
  max_heart_rate?: number
  resting_heart_rate?: number
  weekly_hours_available?: number
  primary_sport?: string
  date_of_birth?: string
  lthr_cycling?: number
  lthr_running?: number
  running_threshold_pace_ms?: number
  secondary_sports?: string[]
  // Phase 7 periodization engine — target event fields
  target_event_date?: string | null
  target_event_type?: 'race' | 'fondo' | 'audax' | 'maintenance' | null
  target_priority?: 'A' | 'B' | 'C' | null
}

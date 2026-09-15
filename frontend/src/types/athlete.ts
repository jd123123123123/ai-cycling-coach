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
  /**
   * Whether an official course (GPX) is stored for the target event. The GPX
   * itself is never sent to the client — it can be megabytes and nothing
   * renders it; this only says whether "rehearse my target event" is open.
   */
  has_target_event_route?: boolean
  // P0-2 timezone handshake — IANA string (e.g. "Europe/Berlin") so the server
  // can bucket days on the ATHLETE's calendar, not UTC. Optional until the
  // backend field lands everywhere.
  timezone?: string | null
  // V3 Settings — suppress coach push notices on rest days (default ON)
  quiet_on_rest_days?: boolean
  // Plan-engine v2 inputs (nullable — unset means "not yet learned/asked")
  days_available?: DaysAvailableFlags | null
  motivation_style?: 'race_focused' | 'fitness_builder' | 'fun_variety' | null
  variety_dial?: 'steady' | 'mixed' | 'adventurous' | null
  experience_level?: 'new' | 'returning' | 'seasoned' | null
  hard_day_blackouts?: string[] | null
  // UI depth register — onboarding depth selector ↔ Settings "Detailgrad".
  // Persisted server-side so the choice follows the athlete across devices.
  detail_level?: DetailLevel | null
  created_at: string
  updated_at: string | null
}

export interface TrainingGoals {
  target_ftp?: number
  target_event_name?: string
  target_event_date?: string
  weekly_hours?: number
  // Weekly-intensity preferences captured during onboarding (free-form JSON on
  // the backend, so extra keys are persisted as-is).
  training_model?: 'polarized' | 'sweetspot' | 'pyramidal'
  days_per_week?: number
  // How hard the coach should push. Modulates the adaptive engine's upside only.
  push_intensity?: 'steady' | 'balanced' | 'aggressive' | 'all_in'
  // The rider's own season distance target in km. The Fahrten dock only fills
  // its season meter against THIS — never a placeholder. 0 clears it.
  season_km_goal?: number
  // What stands on the hero stage: the photographed machine or the bought
  // collection bike. Absent → photo (when one exists).
  stage_bike?: 'photo' | 'collection'
  // Which backdrop the hero room wears — an id from w3stageThemes. Absent →
  // the studio.
  stage_theme?: string
  // The register the coach's brief is written in — an id from w3coachVoices,
  // mirrored from the server's COACH_VOICES. Absent → 'sachlich'.
  coach_voice?: string
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
  /**
   * The official course of the target event, as raw GPX text. The only writer
   * for the column the route-rehearsal `target_event` source reads. Send null
   * to clear it.
   */
  target_event_gpx?: string | null
  // P0-2 timezone handshake — IANA string reported by the browser
  timezone?: string | null
  // V3 Settings — suppress coach push notices on rest days
  quiet_on_rest_days?: boolean
  // Plan-engine v2 inputs (V3 onboarding: hours + days are load-bearing;
  // motivation_style defaults from the depth selector, never asked directly)
  days_available?: DaysAvailableFlags | null
  motivation_style?: 'race_focused' | 'fitness_builder' | 'fun_variety' | null
  variety_dial?: 'steady' | 'mixed' | 'adventurous' | null
  experience_level?: 'new' | 'returning' | 'seasoned' | null
  hard_day_blackouts?: string[] | null
  // UI depth register — persisted so Settings on another device matches.
  detail_level?: DetailLevel | null
}

// UI depth register values (onboarding: Begleite mich / Zeig Zahlen / Voll Pro).
export type DetailLevel = 'guide' | 'numbers' | 'pro'

// Weekday availability flags + the athlete's long-ride day (plan-engine v2).
export interface DaysAvailableFlags {
  mon: boolean
  tue: boolean
  wed: boolean
  thu: boolean
  fri: boolean
  sat: boolean
  sun: boolean
  long_day?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | null
  long_days?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[] | null
}

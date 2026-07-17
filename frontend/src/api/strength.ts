import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Strength-training builder API client.
// Mirrors the backend `/strength` contract 1:1. All auth is handled by the
// shared `apiClient` interceptors (bearer token + refresh), same as every other
// call in this app.
// ---------------------------------------------------------------------------

/** One exercise inside a routine template (the plan, not a logged result). */
export interface RoutineExercise {
  id: number
  name: string
  target_sets: number
  target_reps: string // free-form like "8-12"
  position: number
}

/** A reusable training template, e.g. "Push A" in a 3er Split. */
export interface Routine {
  id: number
  name: string
  notes: string | null
  position: number
  archived: boolean
  exercises: RoutineExercise[]
}

/** Payload for one exercise row when creating/editing a routine. */
export interface RoutineExerciseWrite {
  name: string
  target_sets: number
  target_reps: string
}

export interface RoutineWrite {
  name: string
  notes?: string | null
  exercises: RoutineExerciseWrite[]
}

/** PUT accepts partial fields; exercises (when sent) replace the whole list. */
export interface RoutineUpdate {
  name?: string
  notes?: string | null
  exercises?: RoutineExerciseWrite[]
}

/** One previously-logged set, used to pre-fill the next logging sheet. */
export interface PrefillSet {
  weight_kg: number
  reps: number
  rpe: number | null
}

export interface PrefillExercise {
  name: string
  target_sets: number
  target_reps: string
  /** Last time's actual sets for this exercise — [] when there is no history. */
  last_sets: PrefillSet[]
}

export interface RoutinePrefill {
  routine: { id: number; name: string }
  exercises: PrefillExercise[]
}

/** One set the user actually performed, sent up when logging a session. */
export interface SessionSetWrite {
  exercise_name: string
  set_index: number
  weight_kg: number
  reps: number
  rpe?: number | null
}

export interface SessionWrite {
  routine_id?: number | null
  performed_at?: string | null
  notes?: string | null
  sets: SessionSetWrite[]
}

/** One logged set as returned by the backend. */
export interface SessionSet {
  exercise_name: string
  set_index: number
  weight_kg: number
  reps: number
  rpe: number | null
}

export interface SessionSummary {
  id: number
  routine_id: number | null
  routine_name: string | null
  performed_at: string
  total_volume_kg: number
  top_set: { exercise_name: string; weight_kg: number; reps: number } | null
  sets: SessionSet[]
}

// ---- Routines --------------------------------------------------------------

export async function listRoutines(): Promise<Routine[]> {
  const res = await apiClient.get<Routine[]>('/strength/routines')
  return res.data
}

export async function createRoutine(payload: RoutineWrite): Promise<Routine> {
  const res = await apiClient.post<Routine>('/strength/routines', payload)
  return res.data
}

export async function updateRoutine(id: number, payload: RoutineUpdate): Promise<Routine> {
  const res = await apiClient.put<Routine>(`/strength/routines/${id}`, payload)
  return res.data
}

export async function deleteRoutine(id: number): Promise<void> {
  await apiClient.delete(`/strength/routines/${id}`)
}

export async function getRoutinePrefill(id: number): Promise<RoutinePrefill> {
  const res = await apiClient.get<RoutinePrefill>(`/strength/routines/${id}/prefill`)
  return res.data
}

// ---- Sessions --------------------------------------------------------------

export async function createSession(payload: SessionWrite): Promise<SessionSummary> {
  const res = await apiClient.post<SessionSummary>('/strength/sessions', payload)
  return res.data
}

export async function listSessions(params?: {
  routineId?: number
  limit?: number
}): Promise<SessionSummary[]> {
  const res = await apiClient.get<SessionSummary[]>('/strength/sessions', {
    params: {
      routine_id: params?.routineId,
      limit: params?.limit,
    },
  })
  return res.data
}

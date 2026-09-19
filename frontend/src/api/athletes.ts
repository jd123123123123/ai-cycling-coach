import { apiClient } from './client'
import type { AthleteProfile, AthleteProfileUpdate, TrainingGoals } from '../types/athlete'

/** Was die Fahrten ueber den Arbeitsweg sagen. `detected:false` heisst: zu
 *  wenig Substanz -- dann bleibt das Formular leer statt geraten vorbelegt. */
export interface CommutePattern {
  detected: boolean
  work_days: string[]
  commute_minutes: number | null
  earliest: string | null
  latest: string | null
  rides: number
  pair_ratio: number
  confidence: 'hoch' | 'mittel' | 'niedrig'
}

export async function getCommutePattern(): Promise<CommutePattern> {
  const { data } = await apiClient.get<CommutePattern>('/athletes/me/commute-pattern')
  return data
}

export async function getProfile(): Promise<AthleteProfile> {
  const { data } = await apiClient.get<AthleteProfile>('/athletes/me')
  return data
}

export async function updateProfile(data: AthleteProfileUpdate): Promise<AthleteProfile> {
  const { data: profile } = await apiClient.put<AthleteProfile>('/athletes/me', data)
  return profile
}

export async function getGoals(): Promise<TrainingGoals> {
  const { data } = await apiClient.get<TrainingGoals>('/athletes/me/goals')
  return data
}

// ── P0-2 timezone handshake ─────────────────────────────────────────────────
// Reports the browser's IANA timezone so the server buckets "today" on the
// athlete's calendar instead of UTC. PATCH is the contract landing this wave;
// fall back to the existing partial-update PUT if only that route exists yet.
export async function syncTimezone(timezone: string): Promise<void> {
  try {
    await apiClient.patch<AthleteProfile>('/athletes/me', { timezone })
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 404 || status === 405) {
      await apiClient.put<AthleteProfile>('/athletes/me', { timezone })
      return
    }
    throw err
  }
}

// ── Forgiving streak + athlete status (roadmap P0.2) ────────────────────────
// The streak measures adherence to the plan: trained days and planned rest
// days extend it, self-reported sick/injured/break days pause it, and only a
// skipped planned session (or unplanned gap) breaks it.

export type AthleteState = 'healthy' | 'sick' | 'injured' | 'break'
export type StreakDayState =
  | 'trained' | 'rest' | 'paused' | 'missed' | 'unplanned' | 'today' | 'upcoming'

export interface StreakRead {
  streak: number
  paused: boolean
  status: { state: AthleteState; since: string } | null
  week: { date: string; state: StreakDayState }[]
  /** Most recent past day that broke the streak (ISO date), or null if intact. */
  break_day?: string | null
}

export async function getStreak(): Promise<StreakRead> {
  const { data } = await apiClient.get<StreakRead>('/athletes/me/streak')
  return data
}

// ── One-tap morning-after streak repair (backlog 03·C2) ─────────────────────
// The soft streak-break card offers an HONEST recovery: the most common false
// break is a ride the athlete really did but Garmin hadn't synced yet when the
// break was computed. This triggers a fresh sync + re-evaluation and restores
// the streak ONLY when a qualifying ride for the missed day now exists.

export interface StreakRepairResult {
  repaired: boolean
  reason: 'restored' | 'nothing_to_repair'
  streak: number
  repaired_date: string | null
  /** Whether a fresh Garmin sync actually ran during this check. */
  synced: boolean
}

export async function repairStreak(): Promise<StreakRepairResult> {
  const { data } = await apiClient.post<StreakRepairResult>('/athletes/me/streak/repair')
  return data
}

export interface AthleteStatus {
  state: AthleteState
  since: string | null
  /** Tage, die der Plan wegen dieses Status schon ruht. */
  days_paused: number | null
  /** Heute noch nicht bestaetigt -- die Oberflaeche soll nachfragen. */
  needs_reask: boolean
  /** Der fertige Satz vom Server, damit es nicht zwei Fassungen gibt. */
  prompt_de: string | null
}

export async function setAthleteStatus(state: AthleteState): Promise<AthleteStatus> {
  const { data } = await apiClient.put<AthleteStatus>('/athletes/me/status', { state })
  return data
}

/** Den Lebensstatus lesen. Gab es nicht -- es existierte nur ein PUT, und
 *  deshalb konnte die App nie nachfragen. */
export async function getAthleteStatus(): Promise<AthleteStatus> {
  const { data } = await apiClient.get<AthleteStatus>('/athletes/me/status')
  return data
}

export async function updateGoals(data: TrainingGoals): Promise<AthleteProfile> {
  const { data: profile } = await apiClient.put<AthleteProfile>('/athletes/me/goals', data)
  return profile
}

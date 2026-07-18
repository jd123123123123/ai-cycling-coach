import { apiClient } from './client'
import type { AthleteProfile, AthleteProfileUpdate, TrainingGoals } from '../types/athlete'

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
}

export async function getStreak(): Promise<StreakRead> {
  const { data } = await apiClient.get<StreakRead>('/athletes/me/streak')
  return data
}

export async function setAthleteStatus(state: AthleteState): Promise<{ state: AthleteState; since: string | null }> {
  const { data } = await apiClient.put<{ state: AthleteState; since: string | null }>('/athletes/me/status', { state })
  return data
}

export async function updateGoals(data: TrainingGoals): Promise<AthleteProfile> {
  const { data: profile } = await apiClient.put<AthleteProfile>('/athletes/me/goals', data)
  return profile
}

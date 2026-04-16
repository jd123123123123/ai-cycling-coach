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

export async function updateGoals(data: TrainingGoals): Promise<AthleteProfile> {
  const { data: profile } = await apiClient.put<AthleteProfile>('/athletes/me/goals', data)
  return profile
}

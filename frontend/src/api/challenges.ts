import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Crew Challenges — custom, crew-wide goals (e.g. "500 km this week"). Any
// member can create one; everyone in the crew is scored against the target.
// Mirrors the connections/nudges API style.
// ──────────────────────────────────────────────────────────────────────

// Metrics the backend can score a challenge against.
export type ChallengeMetric =
  | 'tss'
  | 'distance_km'
  | 'active_days'
  | 'hours'
  | 'kj'
  | 'rides'

export type ChallengePeriod = 'week' | 'month'

// One crew member's standing within a challenge.
export interface ChallengeParticipant {
  user_id: number
  handle: string
  value: number
  reached: boolean
  pct: number
}

export interface CrewChallenge {
  id: number
  name: string
  metric: ChallengeMetric
  target: number
  period: ChallengePeriod
  starts_on: string
  ends_on: string
  creator_handle: string
  created_at: string
  participants: ChallengeParticipant[] // sorted by value desc
}

// POST /crews/challenges — create a custom crew challenge.
export interface CreateChallengeInput {
  name: string
  metric: ChallengeMetric
  target: number
  period?: ChallengePeriod
  starts_on?: string
  ends_on?: string
}

export async function createChallenge(
  input: CreateChallengeInput,
): Promise<CrewChallenge> {
  const res = await apiClient.post<CrewChallenge>('/crews/challenges', input)
  return res.data
}

// GET /crews/challenges — all active challenges for my crew.
export async function fetchCrewChallenges(): Promise<CrewChallenge[]> {
  const res = await apiClient.get<CrewChallenge[]>('/crews/challenges')
  return res.data
}

// DELETE /crews/challenges/{id} — remove a challenge (204).
export async function deleteChallenge(id: number): Promise<void> {
  await apiClient.delete(`/crews/challenges/${id}`)
}

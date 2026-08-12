import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Monthly personal challenges — app-defined targets scored against the rider's
// own activities, paying a fixed tier RideCoin reward once on completion.
// Distinct from crew challenges (api/challenges.ts). Backend: /challenges/*.
// ──────────────────────────────────────────────────────────────────────

export type ChallengeMetric =
  | 'tss' | 'distance_km' | 'active_days' | 'hours' | 'kj' | 'rides'
export type ChallengeTier = 'bronze' | 'silver' | 'gold'

export interface RewardChallenge {
  key: string
  title: string
  detail: string
  metric: ChallengeMetric
  target: number
  tier: ChallengeTier
  reward_rc: number
  value: number          // real current progress from the rider's activities
  pct: number            // 0–100
  enrolled: boolean
  completed: boolean
  awarded_rc: number | null
}

export interface MyChallenges {
  period: string         // "YYYY-MM"
  active: RewardChallenge[]
  available: RewardChallenge[]
}

// GET /challenges/mine — active (live progress, auto-completing) + joinable.
export async function fetchMyChallenges(): Promise<MyChallenges> {
  const res = await apiClient.get<MyChallenges>('/challenges/mine')
  return res.data
}

// POST /challenges/{key}/join — enroll in a monthly challenge (idempotent).
export async function joinChallenge(key: string): Promise<{ joined: string; period: string }> {
  const res = await apiClient.post<{ joined: string; period: string }>(
    `/challenges/${key}/join`,
  )
  return res.data
}

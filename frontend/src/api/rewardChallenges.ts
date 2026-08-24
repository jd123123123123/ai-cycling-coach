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
  custom?: boolean       // rider-created (editable/deletable)
  /** How many riders are in this challenge this month. A catalogue entry that
   *  says nothing about who else took it is a to-do list item. */
  participants?: number
}

// ── Who else is in it ───────────────────────────────────────────────────────

export interface BoardRow {
  user_id: number
  handle: string
  avatar_url: string | null
  value: number
  pct: number
  completed: boolean
  rank: number
}

export interface ChallengeBoard {
  key: string
  period: string
  /** Everyone enrolled, not just the rows that fit. */
  participants: number
  /** The rider's own row — present even when they fell off the visible board. */
  you: BoardRow | null
  rows: BoardRow[]
  truncated: boolean
}

/** GET /challenges/{key}/board — everyone in this month's challenge, ranked. */
export async function fetchChallengeBoard(key: string): Promise<ChallengeBoard> {
  const res = await apiClient.get<ChallengeBoard>(`/challenges/${encodeURIComponent(key)}/board`)
  return res.data
}

/** GET /challenges/{key}/days — one number per day of the month.
 *
 *  Feeds the month strip. Deliberately NOT used to restate progress: the total
 *  is its own number, and summing a rounded per-day series would disagree with
 *  it. This answers "which days moved it", which a percentage cannot. */
export async function fetchChallengeDays(key: string): Promise<{ key: string; period: string; days: number[] }> {
  const res = await apiClient.get<{ key: string; period: string; days: number[] }>(
    `/challenges/${encodeURIComponent(key)}/days`)
  return res.data
}

export const CHALLENGE_METRICS: { metric: ChallengeMetric; label: string; unit: string }[] = [
  // Labels are DISPLAYED (the metric chips in the challenge editor, and the
  // unit in "ZIEL · KM"), so they are German like the rest of the W3 app.
  // The `metric` keys are the API contract and stay untouched.
  { metric: 'active_days', label: 'Fahrtage', unit: 'Tage' },
  { metric: 'distance_km', label: 'Distanz', unit: 'km' },
  { metric: 'tss', label: 'Belastung', unit: 'TSS' },
  { metric: 'rides', label: 'Fahrten', unit: 'Fahrten' },
  { metric: 'hours', label: 'Stunden', unit: 'h' },
  { metric: 'kj', label: 'Energie', unit: 'kJ' },
]

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

// POST /challenges/custom — create a rider-defined challenge.
export async function createCustomChallenge(input: { title: string; metric: ChallengeMetric; target: number }) {
  const res = await apiClient.post<{ created: string; tier: ChallengeTier; reward_rc: number }>('/challenges/custom', input)
  return res.data
}

// PATCH /challenges/{key} — edit a custom challenge's title/target.
export async function editCustomChallenge(key: string, input: { title?: string; target?: number }) {
  const res = await apiClient.patch<{ edited: string; tier: ChallengeTier; reward_rc: number; target: number }>(`/challenges/${key}`, input)
  return res.data
}

// DELETE /challenges/{key} — drop a custom challenge.
export async function deleteCustomChallenge(key: string) {
  const res = await apiClient.delete<{ deleted: string }>(`/challenges/${key}`)
  return res.data
}

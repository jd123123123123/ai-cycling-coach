import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Types — mirror app/schemas/crew.py
// ──────────────────────────────────────────────────────────────────────

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface CrewRead {
  id: number
  name: string
  owner_user_id: number
}

export interface CrewMemberRead {
  user_id: number
  handle: string
  joined_at: string
  role: 'owner' | 'member'
}

export interface CrewInviteRead {
  id: number
  invitee_email: string
  created_at: string
  expires_at: string
  status: InviteStatus
}

export interface CrewMineResponse {
  crew: CrewRead | null
  members: CrewMemberRead[]
  pending_invites: CrewInviteRead[]
}

export type CrewPeriod = 'day' | 'week' | 'month' | 'year'

export interface StandingRow {
  user_id: number
  handle: string
  is_you: boolean
  weekly_score: number  // sum of daily points over the window
  weekly_tss: number    // total TSS over the window
  daily_pct: number[]   // ≤14 summed buckets across the window
  // Real per-member values over the same window (for metric re-ranking).
  // Nullable — honest "—" where the source is missing. Elevation + 5K PR
  // have no data source and are intentionally absent.
  distance_km?: number | null  // cumulative ridden distance (km)
  wkg?: number | null          // ftp_watts / weight_kg (threshold W/kg)
  vo2max?: number | null       // latest VO2max on/before window end
  // Each rider's OWN bar (4-week avg weekly TSS × 1.05, floor 60) — the honest
  // denominator behind the points. Nullable on older payloads.
  weekly_target_tss?: number | null
  daily_target_tss?: number | null
}

export interface StandingsResponse {
  crew_id: number
  week_start: string
  week_end: string
  daily_target_tss: number
  standings: StandingRow[]
  period?: CrewPeriod
  period_start?: string | null
  period_end?: string | null
  weekly_target_tss?: number | null   // the CALLER's own weekly bar
  points_basis?: string               // "own_weekly_target"
}

// ──────────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ──────────────────────────────────────────────────────────────────────

export async function fetchMyCrew(): Promise<CrewMineResponse> {
  const res = await apiClient.get<CrewMineResponse>('/crews/me')
  return res.data
}

export async function createCrew(name: string): Promise<CrewMineResponse> {
  const res = await apiClient.post<CrewMineResponse>('/crews', { name })
  return res.data
}

export async function disbandCrew(crewId: number): Promise<void> {
  await apiClient.delete(`/crews/${crewId}`)
}

export async function leaveCrew(): Promise<void> {
  await apiClient.delete('/crews/me/membership')
}

export async function inviteToCrew(
  crewId: number,
  email: string,
): Promise<CrewInviteRead> {
  const res = await apiClient.post<CrewInviteRead>(`/crews/${crewId}/invites`, { email })
  return res.data
}

export async function acceptCrewInvite(token: string): Promise<CrewMineResponse> {
  const res = await apiClient.post<CrewMineResponse>(`/crews/invites/${token}/accept`)
  return res.data
}

export async function revokeCrewInvite(inviteId: number): Promise<void> {
  await apiClient.post(`/crews/invites/${inviteId}/revoke`)
}

export async function fetchCrewStandings(
  period?: CrewPeriod,
  week?: string,
): Promise<StandingsResponse> {
  const params: Record<string, string> = {}
  if (period) params.period = period
  if (week) params.week = week
  const res = await apiClient.get<StandingsResponse>('/crews/me/standings', {
    params: Object.keys(params).length ? params : undefined,
  })
  return res.data
}

// ── Member discovery — find other athletes on the app ──
export interface DiscoverMember {
  user_id: number
  handle: string       // display handle only — never a raw email (privacy)
  in_crew: boolean     // already in a crew → can't be invited
}

export async function discoverMembers(q?: string): Promise<DiscoverMember[]> {
  const res = await apiClient.get<DiscoverMember[]>('/crews/discover', {
    params: q ? { q } : undefined,
  })
  return res.data
}

export async function inviteMemberByUser(
  crewId: number,
  userId: number,
): Promise<CrewInviteRead> {
  const res = await apiClient.post<CrewInviteRead>(
    `/crews/${crewId}/invites/by-user`,
    { user_id: userId },
  )
  return res.data
}

// ── Duel — rich head-to-head weekly stats ──
export interface DuelStats {
  handle: string
  user_id?: number | null
  tss: number
  distance_km: number
  hours: number
  kj: number
  rides: number
  active_days: number
  best_tss: number
  ring_score: number
  avg_if: number
}

export interface DuelResponse {
  week_start: string
  week_end: string
  you_this_week: DuelStats
  you_last_week: DuelStats
  crew: DuelStats[]
}

export async function fetchDuel(): Promise<DuelResponse> {
  const res = await apiClient.get<DuelResponse>('/crews/me/duel')
  return res.data
}

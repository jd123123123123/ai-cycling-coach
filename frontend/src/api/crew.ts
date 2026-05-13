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

export interface StandingRow {
  user_id: number
  handle: string
  is_you: boolean
  weekly_score: number
  weekly_tss: number
  daily_pct: number[]   // 7 entries, Mon..Sun
}

export interface StandingsResponse {
  crew_id: number
  week_start: string
  week_end: string
  daily_target_tss: number
  standings: StandingRow[]
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
  week?: string,
): Promise<StandingsResponse> {
  const res = await apiClient.get<StandingsResponse>('/crews/me/standings', {
    params: week ? { week } : undefined,
  })
  return res.data
}

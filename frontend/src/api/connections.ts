import { apiClient } from './client'
import type { CrewMineResponse, CrewInviteRead } from './crew'

// ──────────────────────────────────────────────────────────────────────
// Connections — "find & connect with people" flow.
// Wraps the 5 crew-connection endpoints. Types mirror the backend.
// ──────────────────────────────────────────────────────────────────────

// GET /crews/discover?q=<text> — search app users by handle.
export interface DiscoverResult {
  user_id: number
  handle: string
  in_crew: boolean
}

export async function discoverPeople(q?: string): Promise<DiscoverResult[]> {
  const res = await apiClient.get<DiscoverResult[]>('/crews/discover', {
    params: q ? { q } : undefined,
  })
  return res.data
}

// POST /crews/connect — send a connection invite (auto-creates crew on first connect).
export async function connectToUser(userId: number): Promise<CrewInviteRead> {
  const res = await apiClient.post<CrewInviteRead>('/crews/connect', {
    user_id: userId,
  })
  return res.data
}

// GET /crews/invites/incoming — pending invites addressed to me (notification feed).
export interface IncomingInvite {
  invite_id: number
  crew_id: number
  crew_name: string
  inviter_handle: string
  created_at: string
}

export async function fetchIncomingInvites(): Promise<IncomingInvite[]> {
  const res = await apiClient.get<IncomingInvite[]>('/crews/invites/incoming')
  return res.data
}

// POST /crews/invites/{invite_id}/accept-mine — accept an invite addressed to me.
export async function acceptIncomingInvite(
  inviteId: number,
): Promise<CrewMineResponse> {
  const res = await apiClient.post<CrewMineResponse>(
    `/crews/invites/${inviteId}/accept-mine`,
  )
  return res.data
}

// POST /crews/invites/{invite_id}/decline — decline an invite addressed to me.
export async function declineIncomingInvite(inviteId: number): Promise<void> {
  await apiClient.post(`/crews/invites/${inviteId}/decline`)
}

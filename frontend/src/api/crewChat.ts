import { apiClient } from './client'
import type { ReactionState } from './crewReactions'

// ──────────────────────────────────────────────────────────────────────
// Crew chat — the crew's shared thread. Mirrors the deployed
// /crews/me/chat endpoints. GET returns the page newest-LAST (ready to
// render top-to-bottom); POST returns the created message.
// ──────────────────────────────────────────────────────────────────────

export interface CrewChatMessage {
  id: number
  crew_id: number
  user_id: number
  handle: string
  display_name: string
  text: string
  created_at: string
  reactions: ReactionState
}

export async function fetchCrewChat(opts?: {
  limit?: number
  beforeId?: number
}): Promise<CrewChatMessage[]> {
  const res = await apiClient.get<CrewChatMessage[]>('/crews/me/chat', {
    params: {
      limit: opts?.limit ?? 50,
      ...(opts?.beforeId != null ? { before_id: opts.beforeId } : {}),
    },
  })
  return res.data
}

export async function postCrewChat(text: string): Promise<CrewChatMessage> {
  const res = await apiClient.post<CrewChatMessage>('/crews/me/chat', { text })
  return res.data
}

import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Nudges — send a random funny trash-talk line to a crew rival, and read
// the nudges other riders have sent to you. Mirrors the connections API.
// ──────────────────────────────────────────────────────────────────────

// POST /crews/nudge — server picks + stores a random funny line for the
// opponent and echoes it back so the sender can see what was sent. When the
// recipient's adaptive directive is rest/deload the coach-safety interlock
// swaps trash talk for encouragement and flags it so the UI can say so.
export interface SentNudge {
  text: string
  to_user_id: number
  coach_intercepted?: boolean
}

export async function sendNudge(toUserId: number): Promise<SentNudge> {
  const res = await apiClient.post<SentNudge>('/crews/nudge', {
    to_user_id: toUserId,
  })
  return res.data
}

// GET /crews/nudges/incoming — unread nudges addressed to me.
export interface IncomingNudge {
  id: number
  from_handle: string
  text: string
  created_at: string
}

export async function fetchIncomingNudges(): Promise<IncomingNudge[]> {
  const res = await apiClient.get<IncomingNudge[]>('/crews/nudges/incoming')
  return res.data
}

// POST /crews/nudges/{id}/read — mark a received nudge as read (204).
export async function markNudgeRead(id: number): Promise<void> {
  await apiClient.post(`/crews/nudges/${id}/read`)
}

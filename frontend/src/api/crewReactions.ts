import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Crew reactions — a shared emoji-reaction primitive used across the
// Social surface (chat messages, the crew's week, crew events, and crew
// rides). Mirrors the deployed /crews/me/reactions endpoints.
// ──────────────────────────────────────────────────────────────────────

// The fixed reaction palette the V3 Social screen offers.
export const CREW_EMOJIS = ['🔥', '💪', '👏', '🚀', '🙌', '⚡'] as const
export type CrewEmoji = (typeof CREW_EMOJIS)[number]

// What a reaction can hang off. `crew_week` is a singleton per crew — it
// carries no target_id (the whole crew's current week).
export type ReactionTargetType = 'message' | 'crew_week' | 'event' | 'ride'

// The reaction roll-up embedded in chat/ride payloads and returned by the
// reactions endpoints: per-emoji counts + the emojis the caller reacted with.
export interface ReactionState {
  counts: Record<string, number>
  mine: string[]
}

export interface ReactionToggleResponse {
  target_type: string
  target_id: number | null
  counts: Record<string, number>
  mine: string[]
  toggled_on: boolean
}

export interface ToggleReactionInput {
  targetType: ReactionTargetType
  targetId?: number
  emoji: string
}

export async function toggleReaction(
  input: ToggleReactionInput,
): Promise<ReactionToggleResponse> {
  const res = await apiClient.post<ReactionToggleResponse>('/crews/me/reactions/toggle', {
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    emoji: input.emoji,
  })
  return res.data
}

export async function fetchReactions(
  targetType: ReactionTargetType,
  targetId?: number,
): Promise<ReactionState> {
  const res = await apiClient.get<ReactionState>('/crews/me/reactions', {
    params: { target_type: targetType, ...(targetId != null ? { target_id: targetId } : {}) },
  })
  return res.data
}

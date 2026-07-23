import { useMutation, useQuery } from '@tanstack/react-query'
import {
  fetchReactions,
  toggleReaction,
  type ReactionState,
  type ReactionTargetType,
  type ToggleReactionInput,
} from '../api/crewReactions'

// Crew reactions. Most surfaces embed their reaction roll-up in the parent
// payload (chat messages, rides), so ReactionBar seeds from that and only
// this toggle mutation is needed. Targets WITHOUT an embedded roll-up (the
// crew week, events) fetch their state via useReactions.

export function useReactions(
  targetType: ReactionTargetType,
  targetId: number | undefined,
  enabled = true,
) {
  return useQuery<ReactionState>({
    queryKey: ['crew', 'reactions', targetType, targetId ?? 'none'],
    queryFn: () => fetchReactions(targetType, targetId),
    enabled,
    staleTime: 30 * 1000,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403 || status === 404) return false
      return failureCount < 1
    },
  })
}

export function useToggleReaction() {
  return useMutation({
    mutationFn: (input: ToggleReactionInput) => toggleReaction(input),
  })
}

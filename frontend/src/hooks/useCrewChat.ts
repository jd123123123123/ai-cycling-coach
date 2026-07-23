import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCrewChat, postCrewChat, type CrewChatMessage } from '../api/crewChat'

// Server-backed crew-chat hooks. The thread polls every ~15s so new
// messages from the crew appear without a manual refresh. Not in a crew →
// the endpoint 403/404s; we don't retry those.

const CHAT_KEY = ['crew', 'chat'] as const

function isTerminal(error: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (error as any)?.response?.status
  return status === 401 || status === 403 || status === 404
}

export function useCrewChat(limit = 50) {
  return useQuery<CrewChatMessage[]>({
    queryKey: [...CHAT_KEY, limit],
    queryFn: () => fetchCrewChat({ limit }),
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 10 * 1000,
    retry: (failureCount, error: unknown) => (isTerminal(error) ? false : failureCount < 1),
  })
}

export function useSendChatMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => postCrewChat(text),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAT_KEY }),
  })
}

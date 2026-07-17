import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchIncomingNudges,
  markNudgeRead,
  sendNudge,
  type IncomingNudge,
  type SentNudge,
} from '../api/nudges'

// Hooks for the nudge (trash-talk) flow, mirroring the connections hooks.
// Incoming nudges are polled like the invites feed so the recipient sees the
// funny line without a manual refresh.

const INCOMING_NUDGES_KEY = ['nudges', 'incoming'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noRetryOnAuth = (failureCount: number, error: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (error as any)?.response?.status
  if (status === 401 || status === 403) return false
  return failureCount < 1
}

export function useIncomingNudges() {
  return useQuery<IncomingNudge[]>({
    queryKey: INCOMING_NUDGES_KEY,
    queryFn: fetchIncomingNudges,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 10 * 1000,
    retry: noRetryOnAuth,
  })
}

export function useSendNudge() {
  return useMutation<SentNudge, unknown, number>({
    mutationFn: (toUserId: number) => sendNudge(toUserId),
  })
}

export function useMarkNudgeRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => markNudgeRead(id),
    // Optimistically drop the read nudge from the inbox, then refetch.
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: INCOMING_NUDGES_KEY })
      const prev = qc.getQueryData<IncomingNudge[]>(INCOMING_NUDGES_KEY)
      if (prev) {
        qc.setQueryData<IncomingNudge[]>(
          INCOMING_NUDGES_KEY,
          prev.filter((n) => n.id !== id),
        )
      }
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      const prev = (ctx as { prev?: IncomingNudge[] } | undefined)?.prev
      if (prev) qc.setQueryData(INCOMING_NUDGES_KEY, prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: INCOMING_NUDGES_KEY }),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createChallenge,
  deleteChallenge,
  fetchCrewChallenges,
  type CreateChallengeInput,
  type CrewChallenge,
} from '../api/challenges'

// Hooks for the crew-challenges flow, mirroring the nudges hooks. The list is
// polled (~30s) so a member sees rivals close the gap — and their own bar tip
// over the target — without a manual refresh.

const CREW_CHALLENGES_KEY = ['challenges', 'crew'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noRetryOnAuth = (failureCount: number, error: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (error as any)?.response?.status
  if (status === 401 || status === 403) return false
  return failureCount < 1
}

export function useCrewChallenges() {
  return useQuery<CrewChallenge[]>({
    queryKey: CREW_CHALLENGES_KEY,
    queryFn: fetchCrewChallenges,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 10 * 1000,
    retry: noRetryOnAuth,
  })
}

export function useCreateChallenge() {
  const qc = useQueryClient()
  return useMutation<CrewChallenge, unknown, CreateChallengeInput>({
    mutationFn: (input: CreateChallengeInput) => createChallenge(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CREW_CHALLENGES_KEY }),
  })
}

export function useDeleteChallenge() {
  const qc = useQueryClient()
  return useMutation<void, unknown, number>({
    mutationFn: (id: number) => deleteChallenge(id),
    // Optimistically drop the deleted challenge from the list, then refetch.
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: CREW_CHALLENGES_KEY })
      const prev = qc.getQueryData<CrewChallenge[]>(CREW_CHALLENGES_KEY)
      if (prev) {
        qc.setQueryData<CrewChallenge[]>(
          CREW_CHALLENGES_KEY,
          prev.filter((c) => c.id !== id),
        )
      }
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      const prev = (ctx as { prev?: CrewChallenge[] } | undefined)?.prev
      if (prev) qc.setQueryData(CREW_CHALLENGES_KEY, prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CREW_CHALLENGES_KEY }),
  })
}

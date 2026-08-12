import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMyChallenges, joinChallenge, createCustomChallenge, editCustomChallenge, deleteCustomChallenge,
  type MyChallenges, type ChallengeMetric,
} from '../api/rewardChallenges'

// Monthly personal challenges with real progress + payouts. Reading can
// auto-complete a challenge (server-side), which credits the wallet — so a
// refetch also freshens the balance shown elsewhere.
export function useRewardChallenges() {
  return useQuery<MyChallenges>({
    queryKey: ['challenges', 'mine'],
    queryFn: fetchMyChallenges,
    staleTime: 60 * 1000,
  })
}

export function useJoinChallenge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => joinChallenge(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges', 'mine'] })
      qc.invalidateQueries({ queryKey: ['rewards', 'wallet'] })
    },
  })
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['challenges', 'mine'] })

export function useCreateChallenge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; metric: ChallengeMetric; target: number }) => createCustomChallenge(input),
    onSuccess: () => invalidate(qc),
  })
}

export function useEditChallenge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, ...input }: { key: string; title?: string; target?: number }) => editCustomChallenge(key, input),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteChallenge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => deleteCustomChallenge(key),
    onSuccess: () => invalidate(qc),
  })
}

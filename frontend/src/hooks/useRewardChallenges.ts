import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyChallenges, joinChallenge, type MyChallenges } from '../api/rewardChallenges'

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

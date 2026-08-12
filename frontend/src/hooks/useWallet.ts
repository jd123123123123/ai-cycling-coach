import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWallet, fetchRideEarning, grantOnboarding, type RideEarning, type Wallet } from '../api/rewards'

// The RideCoin one ride earned — powers the post-ride celebration.
export function useRideEarning(activityId: number | null | undefined) {
  return useQuery<RideEarning>({
    queryKey: ['rewards', 'ride', activityId],
    queryFn: () => fetchRideEarning(activityId as number),
    enabled: activityId != null,
    staleTime: 5 * 60 * 1000,
  })
}

// RideCoin wallet — the real balance/ledger/tier behind the reward screens.
// A cosmetic layer on top of real training, so a slightly stale read is fine.
export function useWallet() {
  return useQuery<Wallet>({
    queryKey: ['rewards', 'wallet'],
    queryFn: fetchWallet,
    staleTime: 5 * 60 * 1000,
  })
}

// The one-time onboarding grants (photo / device). Idempotent server-side;
// on success we refresh the wallet so the balance reflects the head start.
export function useGrantOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (kind: 'photo' | 'device') => grantOnboarding(kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rewards', 'wallet'] })
    },
  })
}

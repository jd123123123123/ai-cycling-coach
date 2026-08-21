import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { claimRide, fetchChest, fetchWallet, fetchRideEarning, grantOnboarding, type Chest, type ClaimResult, type OnboardingKind, type RideEarning, type Wallet } from '../api/rewards'

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

// The one-time onboarding grants (photo / device / bike). Idempotent
// server-side; on success we refresh the wallet so the balance reflects the
// head start.
export function useGrantOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (kind: OnboardingKind) => grantOnboarding(kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rewards', 'wallet'] })
    },
  })
}


export const CHEST_KEY = ['rewards', 'chest'] as const

/**
 * Is there a ride waiting to be opened?
 *
 * Polled gently and refetched on focus, because the answer changes without the
 * rider doing anything in the app — a watch syncs, and a chest appears. The
 * payload is tiny and `sealed: false` is the overwhelmingly common answer.
 */
export function useChest() {
  return useQuery<Chest>({
    queryKey: CHEST_KEY,
    queryFn: fetchChest,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

/**
 * Open one ride's chest — the moment the coins actually arrive.
 *
 * Writes nothing optimistically. A number that appears before the server has
 * agreed can be taken away again, and a balance that flickers downward is the
 * one animation this loop must never show. Wallet and chest are both
 * invalidated on success so the balance chip and the Today bar re-agree.
 */
export function useClaimRide() {
  const qc = useQueryClient()
  return useMutation<ClaimResult, Error, number>({
    mutationFn: (activityId) => claimRide(activityId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['rewards', 'wallet'] })
      qc.invalidateQueries({ queryKey: CHEST_KEY })
      qc.invalidateQueries({ queryKey: ['rewards', 'ride', result.activity_id] })
    },
  })
}

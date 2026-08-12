import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMyReferrals, fetchReferralUser, claimReferral,
  type MyReferrals, type ReferralCard,
} from '../api/referral'

// My referral code + referred riders (active/completed).
export function useMyReferrals() {
  return useQuery<MyReferrals>({
    queryKey: ['referrals', 'mine'],
    queryFn: fetchMyReferrals,
    staleTime: 60 * 1000,
  })
}

// One referred rider's detail (pending/ended).
export function useReferralUser(referredId: number | null | undefined) {
  return useQuery<ReferralCard>({
    queryKey: ['referrals', 'user', referredId],
    queryFn: () => fetchReferralUser(referredId as number),
    enabled: referredId != null,
    staleTime: 60 * 1000,
  })
}

// Claim a completed referral's accrued bonus; refreshes the list + wallet.
export function useClaimReferral() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (referralId: number) => claimReferral(referralId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referrals'] })
      qc.invalidateQueries({ queryKey: ['rewards', 'wallet'] })
    },
  })
}

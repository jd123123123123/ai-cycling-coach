import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptThresholdProposal,
  dismissThresholdProposal,
  fetchThresholdProposal,
  type ThresholdProposal,
} from '../api/threshold'

export const THRESHOLD_PROPOSAL_KEY = ['threshold', 'proposal'] as const

/**
 * Has the evidence moved this athlete's threshold?
 *
 * `staleTime` is long — an hour — because the answer changes at most once per
 * ride and the normal answer is "no". This is a question asked on every Today
 * render; it must cost nothing on the days nothing happened.
 */
export function useThresholdProposal(opts: { enabled?: boolean } = {}) {
  return useQuery<ThresholdProposal>({
    queryKey: THRESHOLD_PROPOSAL_KEY,
    queryFn: () => fetchThresholdProposal('de'),
    staleTime: 60 * 60 * 1000,
    enabled: opts.enabled !== false,
  })
}

export function useAcceptThreshold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (watts: number) => acceptThresholdProposal(watts),
    onSuccess: () => {
      // Accepting rewrites the unit every other number is measured in, so
      // everything downstream of the threshold has to be refetched: the
      // profile itself, the power model, and the zones the plan is built from.
      qc.invalidateQueries({ queryKey: THRESHOLD_PROPOSAL_KEY })
      qc.invalidateQueries({ queryKey: ['athlete', 'profile'] })
      qc.invalidateQueries({ queryKey: ['power-profile'] })
      qc.invalidateQueries({ queryKey: ['training-load'] })
    },
  })
}

export function useDismissThreshold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (watts: number) => dismissThresholdProposal(watts),
    onSuccess: () => qc.invalidateQueries({ queryKey: THRESHOLD_PROPOSAL_KEY }),
  })
}

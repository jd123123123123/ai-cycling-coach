import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

export interface RecoveryEtaDay {
  date: string
  ctl: number
  atl: number
  tsb: number
  tsb_low: number
  tsb_high: number
  planned_tss: number
  source: 'plan' | 'recent-average'
}

export interface RecoveryEta {
  days: RecoveryEtaDay[]
  fresh_on: string | null
  race_sharp_on: string | null
  already_fresh: boolean
  basis: 'plan' | 'recent-average' | 'mixed'
}

/**
 * Shared recovery-ETA query. Key + endpoint match RecoveryEtaCard/TheRoadCard
 * exactly (['training-load', 'recovery-eta'], no days param) so every consumer
 * reads the same cache entry. Audit P0-5: SeasonView previously fetched
 * `?days=14` under a third key (['training-load','recovery-eta',14]) and could
 * drift from the cards.
 */
export function useRecoveryEta() {
  return useQuery<RecoveryEta>({
    queryKey: ['training-load', 'recovery-eta'],
    queryFn: async () => (await apiClient.get<RecoveryEta>('/training-load/recovery-eta')).data,
    staleTime: 30 * 60 * 1000,
  })
}

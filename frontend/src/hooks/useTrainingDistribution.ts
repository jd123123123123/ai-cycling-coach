import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

export interface TrainingDistribution {
  available: boolean
  model?: 'polarized' | 'pyramidal' | 'threshold' | 'high_intensity'
  target?: string
  aligned?: boolean
  phase?: string
  z1_pct?: number
  z2_pct?: number
  z3_pct?: number
  total_hours?: number
  recommendation?: string
}

export function useTrainingDistribution() {
  return useQuery<TrainingDistribution>({
    queryKey: ['analytics', 'training-distribution'],
    queryFn: async () => (await apiClient.get<TrainingDistribution>('/analytics/training-distribution')).data,
  })
}

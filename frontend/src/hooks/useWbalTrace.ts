import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

export interface WbalTrace {
  available: boolean
  activity_id?: number
  title?: string | null
  date?: string | null
  cp_watts?: number
  w_prime_j?: number
  min_kj?: number
  depleted?: boolean
  duration_s?: number
  trace?: Array<{ t: number; pct: number; kj: number }>
}

export function useWbalTrace() {
  return useQuery<WbalTrace>({
    queryKey: ['analytics', 'wbal-trace'],
    queryFn: async () => (await apiClient.get<WbalTrace>('/analytics/wbal-trace')).data,
  })
}

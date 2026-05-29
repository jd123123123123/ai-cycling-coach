import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type { AthleteProfile } from '../types/athlete'

export type { AthleteProfile }

export function useAthleteProfile() {
  return useQuery<AthleteProfile>({
    queryKey: ['athlete', 'me'],
    queryFn: async () => (await apiClient.get<AthleteProfile>('/athletes/me')).data,
  })
}

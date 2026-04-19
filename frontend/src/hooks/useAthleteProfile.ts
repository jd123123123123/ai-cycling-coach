import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

export interface AthleteProfile {
  id: number
  user_id: number
  ftp_watts: number | null
  lthr_cycling: number | null
  // Additional fields exist on the server but only these are needed for Phase 4.5
}

export function useAthleteProfile() {
  return useQuery<AthleteProfile>({
    queryKey: ['athlete', 'me'],
    queryFn: async () => (await apiClient.get<AthleteProfile>('/athletes/me')).data,
  })
}

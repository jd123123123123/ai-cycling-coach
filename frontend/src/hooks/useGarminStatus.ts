import { useQuery } from '@tanstack/react-query'
import { fetchGarminStatus, type GarminStatus } from '../api/dashboard'

export function useGarminStatus() {
  return useQuery<GarminStatus>({
    queryKey: ['garmin', 'status'],
    queryFn: fetchGarminStatus,
  })
}

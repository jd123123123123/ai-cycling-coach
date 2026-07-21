import { useQuery } from '@tanstack/react-query'
import { fetchCorosStatus, type CorosStatus } from '../api/coros'

export function useCorosStatus() {
  return useQuery<CorosStatus>({
    queryKey: ['coros', 'status'],
    queryFn: fetchCorosStatus,
  })
}

import { useQuery } from '@tanstack/react-query'
import { fetchWahooStatus, type WahooStatus } from '../api/wahoo'

export function useWahooStatus() {
  return useQuery<WahooStatus>({
    queryKey: ['wahoo', 'status'],
    queryFn: fetchWahooStatus,
  })
}

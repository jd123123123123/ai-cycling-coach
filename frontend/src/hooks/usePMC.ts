import { useQuery } from '@tanstack/react-query'
import { fetchPMC, type PMCResponse } from '../api/dashboard'

export function usePMC(days = 90) {
  return useQuery<PMCResponse>({
    queryKey: ['pmc', days],
    queryFn: () => fetchPMC(days),
  })
}

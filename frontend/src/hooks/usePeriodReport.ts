import { useQuery } from '@tanstack/react-query'
import { fetchPeriodReport, type PeriodReport } from '../api/report'

export function usePeriodReport(days: number) {
  return useQuery<PeriodReport>({
    queryKey: ['period-report', days],
    queryFn: () => fetchPeriodReport(days),
  })
}

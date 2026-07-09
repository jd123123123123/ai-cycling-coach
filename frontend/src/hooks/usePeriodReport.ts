import { useQuery } from '@tanstack/react-query'
import { fetchPeriodReport, type PeriodReport } from '../api/report'
import { useLocale } from '../contexts/LocaleContext'

export function usePeriodReport(days: number) {
  const { locale } = useLocale()
  return useQuery<PeriodReport>({
    queryKey: ['period-report', days, locale],
    queryFn: () => fetchPeriodReport(days, locale),
  })
}

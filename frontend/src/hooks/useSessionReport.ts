import { useQuery } from '@tanstack/react-query'
import { fetchSessionReport, type SessionReport } from '../api/sessionReport'
import { useLocale } from '../contexts/LocaleContext'

export function useSessionReport(activityId: number | undefined) {
  const { locale } = useLocale()
  return useQuery<SessionReport>({
    queryKey: ['session-report', activityId, locale],
    queryFn: () => fetchSessionReport(activityId as number, locale),
    enabled: activityId != null,
  })
}

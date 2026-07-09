import { useQuery } from '@tanstack/react-query'
import { fetchFormProgress, type FormProgress } from '../api/formProgress'
import { useLocale } from '../contexts/LocaleContext'

export function useFormProgress() {
  const { locale } = useLocale()
  return useQuery<FormProgress | null>({
    queryKey: ['form-progress', locale],
    queryFn: () => fetchFormProgress(locale),
    staleTime: 10 * 60 * 1000,
  })
}

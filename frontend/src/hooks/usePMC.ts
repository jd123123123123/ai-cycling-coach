import { useQuery } from '@tanstack/react-query'
import { fetchPMC, type PMCResponse } from '../api/dashboard'
import { useLanguage } from '../contexts/LanguageContext'

export function usePMC(days = 90) {
  const { language } = useLanguage()
  return useQuery<PMCResponse>({
    // Language is part of the key so toggling 'simple' <-> 'technical' triggers
    // a refetch and fresh narratives come back in the new tone.
    queryKey: ['pmc', days, language],
    queryFn: () => fetchPMC(days, language),
  })
}

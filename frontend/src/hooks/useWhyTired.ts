import { useQuery } from '@tanstack/react-query'
import { fetchWhyTired, fetchTransparency, type WhyTiredResponse, type TransparencyResponse } from '../api/coach'

export const WHY_TIRED_KEY = ['coach', 'why'] as const
export const TRANSPARENCY_KEY = ['coach', 'transparency'] as const

/**
 * Fetches the causal "why am I tired" chain.
 * `enabled` is caller-controlled — only fetch when the modal opens.
 */
export function useWhyTired(enabled: boolean) {
  return useQuery<WhyTiredResponse>({
    queryKey: WHY_TIRED_KEY,
    queryFn: fetchWhyTired,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min
    refetchOnWindowFocus: false,
  })
}

/**
 * Fetches the full transparency payload (snapshot + system prompt).
 * `enabled` is caller-controlled — heavy payload, only fetch on demand.
 */
export function useTransparency(enabled: boolean) {
  return useQuery<TransparencyResponse>({
    queryKey: TRANSPARENCY_KEY,
    queryFn: fetchTransparency,
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

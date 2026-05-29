import { useQuery } from '@tanstack/react-query'
import {
  fetchExternalWorkouts,
  type ExternalPlatform,
  type ExternalWorkoutsResponse,
} from '../api/coach'

export const EXTERNAL_WORKOUTS_KEY = ['coach', 'external-workouts'] as const

export function useExternalWorkouts(opts?: {
  platforms?: ExternalPlatform[]
  limit?: number
}) {
  const platformsKey = opts?.platforms?.join(',') ?? 'all'
  const limit = opts?.limit ?? 5
  return useQuery<ExternalWorkoutsResponse>({
    queryKey: [...EXTERNAL_WORKOUTS_KEY, platformsKey, limit],
    queryFn: () => fetchExternalWorkouts(opts),
    staleTime: 30 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}

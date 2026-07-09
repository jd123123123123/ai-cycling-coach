import { useQuery } from '@tanstack/react-query'
import { fetchGoalTrajectory, type GoalTrajectoryResponse } from '../api/coach'
import { useLocale } from '../contexts/LocaleContext'

export const GOAL_TRAJECTORY_KEY = ['coach', 'trajectory'] as const

export function useGoalTrajectory() {
  const { locale } = useLocale()
  return useQuery<GoalTrajectoryResponse>({
    queryKey: [...GOAL_TRAJECTORY_KEY, locale],
    queryFn: () => fetchGoalTrajectory(locale),
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

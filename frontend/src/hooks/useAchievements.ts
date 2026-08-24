import { fetchRecords, type RiderRecords } from '../api/records'
import { useQuery } from '@tanstack/react-query'
import { fetchAchievements, type AchievementsPayload } from '../api/achievements'

// The real training-milestone grid behind the W3 Wins badges. Detected
// server-side from the athlete's own rides, so a slightly stale read is fine.
export function useAchievements(lang: 'en' | 'de' = 'en') {
  return useQuery<AchievementsPayload>({
    queryKey: ['achievements', 'mine', lang],
    queryFn: () => fetchAchievements(lang),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * The rider's lifetime bests.
 *
 * `staleTime` is long because a record changes at most once per ride, and the
 * profile is a screen people revisit — refetching four ORDER BY queries every
 * time somebody opens their own profile buys nothing.
 */
export function useRiderRecords() {
  return useQuery<RiderRecords>({
    queryKey: ['achievements', 'records'],
    queryFn: fetchRecords,
    staleTime: 10 * 60 * 1000,
  })
}

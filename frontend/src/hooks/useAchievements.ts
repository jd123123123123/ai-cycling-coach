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

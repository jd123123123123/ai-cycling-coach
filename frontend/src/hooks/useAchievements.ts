import { fetchRecords, type RiderRecords } from '../api/records'
import { useQuery } from '@tanstack/react-query'
import { fetchAchievements, type AchievementsPayload } from '../api/achievements'

// The real training-milestone grid behind the W3 Wins badges. Detected
// server-side from the athlete's own rides, so a slightly stale read is fine.
// The UI is German-only, so the default language is German. It used to default
// to 'en', and only the Wins page passed 'de' — so Today's next-badge card and
// the Biker screen rendered the English catalogue ("100 rides", "62 of 100
// rides") inside a German app, and fetched a second copy of the payload to do
// it. The catalogue has carried `title_de`/`detail_de` all along.
export function useAchievements(lang: 'en' | 'de' = 'de') {
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

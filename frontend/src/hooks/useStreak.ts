import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getStreak, setAthleteStatus, type AthleteState, type StreakRead } from '../api/athletes'

// P1-11: weekly rhythm — how many of the current athlete-local week's PLANNED
// days were met. This is the stat surfaces show instead of a daily streak.
export interface WeekConsistency {
  met: number
  planned: number
}

// Tolerant read shape: the backend is gaining `consistency` on the streak
// payload; until it lands, the field is simply absent and consumers hide the
// weekly-rhythm stat entirely (never a fabricated 0/0).
export type StreakWithConsistency = StreakRead & { consistency?: WeekConsistency | null }

// Plan-aware forgiving streak (roadmap P0.2). Status changes cascade into the
// adaptive directive (sick/injured → rest) which in turn drives the coach-
// safety interlock — so a status mutation invalidates all three stories.
export function useStreak() {
  return useQuery<StreakWithConsistency>({
    queryKey: ['athlete', 'streak'],
    queryFn: getStreak,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSetAthleteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (state: AthleteState) => setAthleteStatus(state),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athlete', 'streak'] })
      qc.invalidateQueries({ queryKey: ['coach', 'adaptive'] })
      qc.invalidateQueries({ queryKey: ['coach'] })
    },
  })
}

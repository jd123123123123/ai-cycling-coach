import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getStreak, setAthleteStatus, type AthleteState, type StreakRead } from '../api/athletes'

// Plan-aware forgiving streak (roadmap P0.2). Status changes cascade into the
// adaptive directive (sick/injured → rest) which in turn drives the coach-
// safety interlock — so a status mutation invalidates all three stories.
export function useStreak() {
  return useQuery<StreakRead>({
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

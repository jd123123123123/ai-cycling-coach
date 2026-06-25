import { useQuery } from '@tanstack/react-query'
import { getWorkout, listWorkouts, type WorkoutGroupDetail, type WorkoutGroupSummary } from '../api/workouts'

export function useWorkouts() {
  return useQuery<WorkoutGroupSummary[]>({
    queryKey: ['workouts'],
    queryFn: listWorkouts,
    staleTime: 5 * 60_000,
  })
}

export function useWorkout(key: string | null) {
  return useQuery<WorkoutGroupDetail>({
    queryKey: ['workouts', key],
    queryFn: () => getWorkout(key as string),
    enabled: key !== null,
    staleTime: 5 * 60_000,
  })
}

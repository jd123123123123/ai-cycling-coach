import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchPlannedWorkouts, createPlannedWorkout, updatePlannedWorkout, deletePlannedWorkout,
  type PlannedWorkout, type PlannedWorkoutListResponse,
  type PlannedWorkoutCreateBody, type PlannedWorkoutUpdateBody,
} from '../api/dashboard'

export function usePlannedWorkouts(start: Date, end: Date) {
  return useQuery<PlannedWorkoutListResponse>({
    queryKey: ['planned-workouts', start.toDateString(), end.toDateString()],
    queryFn: () => fetchPlannedWorkouts(start, end),
  })
}

export function useCreatePlannedWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PlannedWorkoutCreateBody) => createPlannedWorkout(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planned-workouts'] }) },
  })
}

// Optimistic update — critical for drag-drop UX. Rolls back on error.
export function useUpdatePlannedWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PlannedWorkoutUpdateBody }) => updatePlannedWorkout(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: ['planned-workouts'] })
      const prev = qc.getQueriesData<PlannedWorkoutListResponse>({ queryKey: ['planned-workouts'] })
      for (const [key, data] of prev) {
        if (!data) continue
        qc.setQueryData<PlannedWorkoutListResponse>(key, {
          ...data,
          planned_workouts: data.planned_workouts.map((pw: PlannedWorkout) =>
            pw.id === id ? { ...pw, ...body } : pw,
          ),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        for (const [key, data] of ctx.prev) qc.setQueryData(key, data)
      }
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['planned-workouts'] }) },
  })
}

export function useDeletePlannedWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deletePlannedWorkout(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planned-workouts'] }) },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchRideRpe, putRideRpe, type RideFeedbackRead, type RpeValue } from '../api/rideFeedback'

/** Read the persisted post-ride RPE for an activity. */
export function useRideRpe(activityId: number | undefined) {
  return useQuery<RideFeedbackRead>({
    queryKey: ['ride-rpe', activityId],
    queryFn: () => fetchRideRpe(activityId as number),
    enabled: activityId != null && Number.isFinite(activityId),
  })
}

/** Persist the athlete's RPE answer — optimistic so the selected chip sticks
 *  instantly, then reconciles with the server's stored value. */
export function useSetRideRpe(activityId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rpe: RpeValue) => putRideRpe(activityId as number, rpe),
    onMutate: async (rpe: RpeValue) => {
      await qc.cancelQueries({ queryKey: ['ride-rpe', activityId] })
      const prev = qc.getQueryData<RideFeedbackRead>(['ride-rpe', activityId])
      qc.setQueryData<RideFeedbackRead>(['ride-rpe', activityId], {
        activity_id: activityId as number,
        rpe,
        updated_at: new Date().toISOString(),
      })
      return { prev }
    },
    onError: (_e, _rpe, ctx) => {
      if (ctx?.prev) qc.setQueryData(['ride-rpe', activityId], ctx.prev)
    },
    onSuccess: (data) => {
      qc.setQueryData(['ride-rpe', activityId], data)
    },
  })
}

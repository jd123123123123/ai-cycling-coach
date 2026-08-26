import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCrewRideComments,
  postCrewRideComment,
  type CrewRide,
  type CrewRideComment,
} from '../api/crewRides'

// The comment thread under one crew ride. Fetched only when a rider opens a
// ride — a feed of twenty threads nobody has looked at is twenty requests.

export function useCrewRideComments(activityId: number | null) {
  return useQuery<CrewRideComment[]>({
    queryKey: ['crew', 'ride-comments', activityId],
    queryFn: () => fetchCrewRideComments(activityId as number),
    enabled: activityId != null,
    staleTime: 30 * 1000,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403 || status === 404) return false
      return failureCount < 1
    },
  })
}

export function usePostCrewRideComment(activityId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => postCrewRideComment(activityId, text),
    onSuccess: (created) => {
      // Append to the open thread rather than refetching it — the rider is
      // looking at the list as it lands.
      qc.setQueryData<CrewRideComment[]>(
        ['crew', 'ride-comments', activityId],
        (prev) => [...(prev ?? []), created],
      )
      // The badge in the collapsed row counts the same thread, and it lives in
      // a different query. Bumping it here keeps the two from disagreeing
      // until the feed's next poll.
      qc.setQueriesData<CrewRide[]>({ queryKey: ['crew', 'rides'] }, (prev) =>
        prev?.map((r) =>
          r.id === activityId ? { ...r, comment_count: r.comment_count + 1 } : r,
        ),
      )
    },
  })
}

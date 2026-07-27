import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCrewEvent,
  fetchCrewEvent,
  fetchCrewEvents,
  rsvpCrewEvent,
  uploadCrewEventTour,
  type CreateEventInput,
  type CrewEvent,
  type RsvpStatus,
} from '../api/crewEvents'

// Server-backed crew-events hooks. Mirrors the patterns in hooks/useCrew.ts.
// Every endpoint is crew-scoped; not in a crew → the list endpoint returns [].

const EVENTS_KEY = ['crew', 'events'] as const
const eventKey = (id: number) => ['crew', 'event', id] as const

export function useCrewEvent(eventId: number | null) {
  return useQuery<CrewEvent>({
    queryKey: eventKey(eventId ?? -1),
    queryFn: () => fetchCrewEvent(eventId as number),
    enabled: eventId != null,
    staleTime: 60 * 1000,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403 || status === 404) return false
      return failureCount < 1
    },
  })
}

export function useCrewEvents(includePast = false) {
  return useQuery<CrewEvent[]>({
    queryKey: [...EVENTS_KEY, includePast ? 'all' : 'upcoming'],
    queryFn: () => fetchCrewEvents(includePast),
    staleTime: 60 * 1000,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}

export function useCreateCrewEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEventInput) => createCrewEvent(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
  })
}

// RSVP with an optimistic flip of my_status + going_count on every cached list,
// rolled back on error and reconciled from the server response on success.
export function useRsvpCrewEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, status }: { eventId: number; status: RsvpStatus }) =>
      rsvpCrewEvent(eventId, status),
    onMutate: async ({ eventId, status }) => {
      await qc.cancelQueries({ queryKey: EVENTS_KEY })
      const snapshots = qc.getQueriesData<CrewEvent[]>({ queryKey: EVENTS_KEY })
      for (const [key, list] of snapshots) {
        if (!list) continue
        qc.setQueryData<CrewEvent[]>(
          key,
          list.map((ev) => {
            if (ev.id !== eventId) return ev
            const was = ev.my_status
            const counts = { ...ev.counts }
            if (was) counts[was] = Math.max(0, counts[was] - 1)
            counts[status] = (counts[status] ?? 0) + 1
            return { ...ev, my_status: status, counts, going_count: counts.going }
          }),
        )
      }
      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(([key, list]) => qc.setQueryData(key, list))
    },
    onSuccess: (updated) => {
      // Reconcile every cached list from the authoritative server row.
      const snapshots = qc.getQueriesData<CrewEvent[]>({ queryKey: EVENTS_KEY })
      for (const [key, list] of snapshots) {
        if (!list) continue
        qc.setQueryData<CrewEvent[]>(
          key,
          list.map((ev) => (ev.id === updated.id ? updated : ev)),
        )
      }
    },
  })
}

export function useUploadCrewEventTour() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, file }: { eventId: number; file: File }) =>
      uploadCrewEventTour(eventId, file),
    onSuccess: (updated) => {
      const snapshots = qc.getQueriesData<CrewEvent[]>({ queryKey: EVENTS_KEY })
      for (const [key, list] of snapshots) {
        if (!list) continue
        qc.setQueryData<CrewEvent[]>(
          key,
          list.map((ev) => (ev.id === updated.id ? updated : ev)),
        )
      }
      qc.invalidateQueries({ queryKey: EVENTS_KEY })
    },
  })
}

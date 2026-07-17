import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createRoutine,
  createSession,
  deleteRoutine,
  getRoutinePrefill,
  listRoutines,
  listSessions,
  updateRoutine,
  type Routine,
  type RoutinePrefill,
  type RoutineUpdate,
  type RoutineWrite,
  type SessionSummary,
  type SessionWrite,
} from '../api/strength'

// Query-key registry — one place so mutations invalidate the right caches.
const KEYS = {
  routines: ['strength', 'routines'] as const,
  prefill: (id: number) => ['strength', 'prefill', id] as const,
  sessions: (routineId?: number) => ['strength', 'sessions', routineId ?? 'all'] as const,
  sessionsRoot: ['strength', 'sessions'] as const,
}

// ---- Routines --------------------------------------------------------------

export function useRoutines() {
  return useQuery<Routine[]>({
    queryKey: KEYS.routines,
    queryFn: listRoutines,
    staleTime: 60_000,
  })
}

export function useCreateRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RoutineWrite) => createRoutine(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.routines })
    },
  })
}

export function useUpdateRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: RoutineUpdate }) =>
      updateRoutine(id, payload),
    onSuccess: (_updated, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.routines })
      qc.invalidateQueries({ queryKey: KEYS.prefill(id) })
    },
  })
}

export function useDeleteRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteRoutine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.routines })
    },
  })
}

// ---- Prefill (previous weights for easy adaptation) ------------------------

/**
 * Fetches the last-time weights/reps for every exercise in a routine so the
 * logging sheet can pre-fill them. Only enabled while a routine id is set
 * (i.e. the logging sheet is open) so we don't fetch on the list screen.
 */
export function useRoutinePrefill(routineId: number | null) {
  return useQuery<RoutinePrefill>({
    queryKey: routineId ? KEYS.prefill(routineId) : ['strength', 'prefill', 'null'],
    queryFn: () => getRoutinePrefill(routineId as number),
    enabled: routineId !== null,
    staleTime: 0, // always show the freshest "last time" when reopening
  })
}

// ---- Sessions --------------------------------------------------------------

export function useSessions(routineId?: number, limit = 20) {
  return useQuery<SessionSummary[]>({
    queryKey: KEYS.sessions(routineId),
    queryFn: () => listSessions({ routineId, limit }),
    staleTime: 60_000,
  })
}

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SessionWrite) => createSession(payload),
    onSuccess: (created) => {
      // New session + its top-set become "last time" next round, so refresh
      // sessions, the routine's prefill, and any activity-derived strength stats.
      qc.invalidateQueries({ queryKey: KEYS.sessionsRoot })
      if (created.routine_id != null) {
        qc.invalidateQueries({ queryKey: KEYS.prefill(created.routine_id) })
      }
      qc.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}

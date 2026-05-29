import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createDashboard,
  deleteDashboard,
  getDashboard,
  listDashboards,
  updateDashboard,
  type UserDashboard,
  type UserDashboardListItem,
  type UserDashboardWrite,
} from '../api/dashboards'

const KEYS = {
  list: ['dashboards'] as const,
  one: (id: number) => ['dashboards', id] as const,
}

export function useDashboards() {
  return useQuery<UserDashboardListItem[]>({
    queryKey: KEYS.list,
    queryFn: listDashboards,
    staleTime: 60_000,
  })
}

export function useDashboard(id: number | null) {
  return useQuery<UserDashboard>({
    queryKey: id ? KEYS.one(id) : ['dashboards', 'null'],
    queryFn: () => getDashboard(id as number),
    enabled: id !== null,
    staleTime: 60_000,
  })
}

export function useCreateDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserDashboardWrite) => createDashboard(payload),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: KEYS.list })
      qc.setQueryData(KEYS.one(created.id), created)
    },
  })
}

export function useUpdateDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserDashboardWrite }) =>
      updateDashboard(id, payload),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: KEYS.list })
      qc.setQueryData(KEYS.one(updated.id), updated)
    },
  })
}

export function useDeleteDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteDashboard(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list })
    },
  })
}

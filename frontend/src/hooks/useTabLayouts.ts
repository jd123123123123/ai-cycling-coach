import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTabLayouts, putTabLayouts, type TabLayouts } from '../api/tabLayouts'

const KEY = ['tab-layouts'] as const

export function useTabLayouts() {
  return useQuery<TabLayouts>({
    queryKey: KEY,
    queryFn: getTabLayouts,
    staleTime: 5 * 60_000,
  })
}

export function useUpdateTabLayouts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TabLayouts) => putTabLayouts(payload),
    // Optimistic: write the new blob into cache immediately so the UI reflects
    // the reorder without waiting for the round-trip.
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: KEY })
      const prev = qc.getQueryData<TabLayouts>(KEY)
      qc.setQueryData<TabLayouts>(KEY, payload)
      return { prev }
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

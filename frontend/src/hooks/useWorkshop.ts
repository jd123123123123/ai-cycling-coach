import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWorkshop, serviceComponent, type ServiceResult, type Workshop } from '../api/workshop'

/** `useWallet` declares this key inline; mirrored here rather than exported
 *  from there so this module adds no imports to a hook six screens already
 *  depend on. If that key ever moves, this must move with it. */
const WALLET_KEY = ['rewards', 'wallet'] as const

export const WORKSHOP_KEY = ['workshop'] as const

/**
 * The bike's condition and its unharvested Service Bonus.
 *
 * `staleTime` is short — 30 s — because unlike the garage collectibles this
 * payload is small and it changes for a reason the rider cares about: a ride
 * landing moves every odometer. A stale workshop shows the wrong harvest, and
 * the harvest is the number the whole screen is about.
 */
export function useWorkshop(opts: { enabled?: boolean } = {}) {
  return useQuery<Workshop>({
    queryKey: WORKSHOP_KEY,
    queryFn: fetchWorkshop,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  })
}

/**
 * Service one component: reset its interval and collect what it banked.
 *
 * Writes the server's own refreshed workshop straight into the cache instead of
 * invalidating and refetching. That is not an optimisation — a refetch would
 * blank the panel and re-animate every meter on the one screen the rider just
 * acted on, and the response already carries the exact post-service state.
 *
 * The wallet IS invalidated, because a service credits RideCoin and the balance
 * chip lives in a different query that has no other way to learn about it.
 */
export function useServiceComponent() {
  const qc = useQueryClient()
  return useMutation<ServiceResult, Error, string>({
    mutationFn: serviceComponent,
    onSuccess: (result) => {
      qc.setQueryData(WORKSHOP_KEY, result.workshop)
      if (result.paid_rc > 0) qc.invalidateQueries({ queryKey: WALLET_KEY })
    },
  })
}

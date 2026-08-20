import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  declareComponent, fetchMethods, fetchWorkshop, seedComponent, serviceComponent,
  setMethod, type MethodOption, type SeedResult, type ServiceResult, type Workshop,
} from '../api/workshop'

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
  return useMutation<ServiceResult, Error, { componentId: string; proofImage?: string | null }>({
    mutationFn: ({ componentId, proofImage }) => serviceComponent(componentId, proofImage),
    onSuccess: (result) => {
      qc.setQueryData(WORKSHOP_KEY, result.workshop)
      if (result.paid_rc > 0) qc.invalidateQueries({ queryKey: WALLET_KEY })
    },
  })
}

/**
 * Answer "wann zuletzt?" and let the server rebuild the odometer from the real
 * ride history.
 *
 * No wallet invalidation, on purpose: seeding pays NOTHING. It would be easy to
 * make backdating a service pay out its banked bonus retroactively, and that
 * would turn one honest question into a slider a rider can drag for RideCoin.
 * The seed only ever moves the clock to where it already was.
 */
export function useSeedComponent() {
  const qc = useQueryClient()
  return useMutation<SeedResult, Error, { componentId: string; lastServiceOn: string }>({
    mutationFn: ({ componentId, lastServiceOn }) => seedComponent(componentId, lastServiceOn),
    onSuccess: (result) => qc.setQueryData(WORKSHOP_KEY, result.workshop),
  })
}

/** Say whether the bike has an optional part. Answering "no" is what stops the
 *  app asking — see the tri-state `owned` on the server. */
export function useDeclareComponent() {
  const qc = useQueryClient()
  return useMutation<Workshop, Error, { componentId: string; owned: boolean }>({
    mutationFn: ({ componentId, owned }) => declareComponent(componentId, owned),
    onSuccess: (workshop) => qc.setQueryData(WORKSHOP_KEY, workshop),
  })
}


/** The maintenance regimes a component supports, with each one's real interval.
 *
 *  Cached for the session: the catalogue is a deployment constant, so refetching
 *  it would be pure noise on a screen that is already doing three writes. */
export function useComponentMethods(componentId: string, enabled = true) {
  return useQuery<MethodOption[]>({
    queryKey: ['workshop', 'methods', componentId],
    queryFn: () => fetchMethods(componentId),
    staleTime: Infinity,
    enabled,
  })
}

/** Switch how a component is maintained. No wallet invalidation: changing lube
 *  pays nothing, it only rebases the clock. */
export function useSetMethod() {
  const qc = useQueryClient()
  return useMutation<Workshop, Error, { componentId: string; method: string }>({
    mutationFn: ({ componentId, method }) => setMethod(componentId, method),
    onSuccess: (workshop) => qc.setQueryData(WORKSHOP_KEY, workshop),
  })
}

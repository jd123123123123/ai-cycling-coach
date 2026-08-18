import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buyItem, claimFirstBike, equipItem, fetchGarage, type Garage } from '../api/shop'

export const GARAGE_QUERY_KEY = ['shop', 'garage'] as const

/** What the rider owns and is wearing. */
export function useGarageCollection() {
  return useQuery<Garage>({
    queryKey: GARAGE_QUERY_KEY,
    queryFn: fetchGarage,
    staleTime: 60 * 1000,
  })
}

/**
 * Buy an item.
 *
 * The response is written straight into the cache rather than triggering a
 * refetch, because a purchase returns the complete post-purchase state
 * (balance + owned + loadout) — refetching would show the rider a stale balance
 * for one frame, which on the one screen that just took their RideCoin is
 * exactly where a wrong number is least forgivable.
 *
 * The RideCoin wallet is a SEPARATE query used by the Biker/Today surfaces, so
 * it has to be invalidated too or the balance in the tab bar disagrees with the
 * balance in the shop.
 */
export function useBuyItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => buyItem(itemId),
    onSuccess: (res) => {
      qc.setQueryData<Garage>(GARAGE_QUERY_KEY, {
        balance: res.balance, owned: res.owned, loadout: res.loadout,
      })
      qc.invalidateQueries({ queryKey: ['rewards', 'wallet'] })
    },
  })
}

/**
 * Claim the free first bike — the act onboarding will not let a rider past.
 *
 * Writes the returned garage straight into the cache like a purchase does, so
 * the gate that sent them here (`loadout.bike == null`) flips in the same tick
 * the server confirms; a refetch would leave a window where the rider has a
 * bike and the app still thinks they need onboarding. The wallet is invalidated
 * because claiming also pays the one-time onboarding grant.
 */
export function useClaimFirstBike() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => claimFirstBike(itemId),
    onSuccess: (res) => {
      qc.setQueryData<Garage>(GARAGE_QUERY_KEY, {
        balance: res.balance, owned: res.owned, loadout: res.loadout,
      })
      qc.invalidateQueries({ queryKey: ['rewards', 'wallet'] })
    },
  })
}

/** Wear an owned item. Optimistic: swapping bar tape must feel instant, and the
 *  only failure mode is "you don't own it", which the UI already prevents. */
export function useEquipItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => equipItem(itemId),
    onSuccess: (res) => {
      qc.setQueryData<Garage>(GARAGE_QUERY_KEY, (prev) =>
        prev ? { ...prev, loadout: res.loadout } : prev)
    },
  })
}

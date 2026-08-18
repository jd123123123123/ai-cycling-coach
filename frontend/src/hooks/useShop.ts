import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buyItem, claimFirstBike, equipItem, fetchGarage, renderBuild, type Garage } from '../api/shop'

export const GARAGE_QUERY_KEY = ['shop', 'garage'] as const

/**
 * What the rider owns and is wearing.
 *
 * POLLS ONLY WHILE A BUILD IS BEING PHOTOGRAPHED. A composed render takes an
 * image-model call, so `pending` is a real, visible state — the garage checks
 * back every few seconds until the picture lands and then stops. Every other
 * state polls not at all, which is almost always.
 */
export function useGarageCollection() {
  return useQuery<Garage>({
    queryKey: GARAGE_QUERY_KEY,
    queryFn: fetchGarage,
    staleTime: 60 * 1000,
    refetchInterval: (q) => (q.state.data?.render_status === 'pending' ? 4000 : false),
  })
}

/**
 * Make sure the current build has been photographed.
 *
 * Asks once, on the states that need it: `none` (a build nobody has made yet)
 * and `failed` (retry — the usual cause is a briefly missing image model).
 * `stock` costs nothing and needs nothing; `ok` is already done; `pending` is
 * already in flight, possibly for a completely different rider building the
 * same bike.
 */
export function useEnsureBuildRender(enabled = true) {
  const qc = useQueryClient()
  const { data } = useGarageCollection()
  const status = data?.render_status
  const key = data?.build_key

  const ask = useMutation({
    mutationFn: renderBuild,
    onSuccess: (res) => {
      qc.setQueryData<Garage>(GARAGE_QUERY_KEY, (prev) =>
        prev ? { ...prev, render_status: res.status, render: res.render } : prev)
    },
  })
  const { mutate } = ask

  useEffect(() => {
    if (!enabled || !key) return
    if (status !== 'none' && status !== 'failed') return
    mutate()
    // `key` is in the deps so a rider who changes their build asks again for
    // the NEW one; without it a second swap would never be photographed.
  }, [enabled, key, status, mutate])

  return { status, isRendering: status === 'pending' || ask.isPending }
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
      qc.setQueryData<Garage>(GARAGE_QUERY_KEY, (prev) => ({
        ...prev,
        balance: res.balance, owned: res.owned, loadout: res.loadout,
        bike_km: res.bike_km,
        // Buying does not change what is WORN, so the current build's photo
        // still stands; the response carries it rather than blanking the hero.
        build_key: res.build_key,
        render_status: res.render_status,
        render: res.render,
      }))
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
      qc.setQueryData<Garage>(GARAGE_QUERY_KEY, (prev) => ({
        ...prev,
        balance: res.balance, owned: res.owned, loadout: res.loadout,
        bike_km: res.bike_km,
        // Buying does not change what is WORN, so the current build's photo
        // still stands; the response carries it rather than blanking the hero.
        build_key: res.build_key,
        render_status: res.render_status,
        render: res.render,
      }))
      qc.invalidateQueries({ queryKey: ['rewards', 'wallet'] })
    },
  })
}

/**
 * Wear an owned item. Optimistic: swapping bar tape must feel instant, and the
 * only failure mode is "you don't own it", which the UI already prevents.
 *
 * THE OLD PHOTOGRAPH IS DROPPED IMMEDIATELY. It is a picture of the build the
 * rider just stopped riding, so keeping it on screen would show gold rims for
 * several seconds after they were taken off — a confident lie. Clearing it
 * falls back to the plain catalogue bike, which is honest, and the refetch
 * brings the new build's status (usually `none`, which starts a render).
 */
export function useEquipItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => equipItem(itemId),
    onSuccess: (res) => {
      qc.setQueryData<Garage>(GARAGE_QUERY_KEY, (prev) =>
        prev ? { ...prev, loadout: res.loadout, render: null, render_status: 'none' } : prev)
      qc.invalidateQueries({ queryKey: GARAGE_QUERY_KEY })
    },
  })
}

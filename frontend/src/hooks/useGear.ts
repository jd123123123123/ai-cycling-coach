import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  buyGear, equipGear, fetchBikeBuild, fetchGear, unequipGear,
  type BikeBuild, type Gear,
} from '../api/gear'

export const GEAR_KEY = ['gear'] as const
export const BUILD_KEY = ['gear', 'build'] as const

/**
 * The rider's bike wearing their loadout.
 *
 * `staleTime: Infinity` because a build is a pure function of the bike and the
 * loadout, and both invalidate this key themselves when they change. Left to a
 * timer it would silently re-request an image-model render, which is the one
 * request in the app that must only ever happen on purpose.
 */
export function useBikeBuild(opts: { enabled?: boolean } = {}) {
  return useQuery<BikeBuild>({
    queryKey: BUILD_KEY,
    queryFn: fetchBikeBuild,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
    enabled: opts.enabled ?? true,
  })
}

/** `useWallet` declares this key inline; mirrored rather than exported from
 *  there so this module adds no import to a hook six screens depend on. */
const WALLET_KEY = ['rewards', 'wallet'] as const

export function useGear(opts: { enabled?: boolean } = {}) {
  return useQuery<Gear>({
    queryKey: GEAR_KEY,
    queryFn: fetchGear,
    staleTime: 60 * 1000,
    enabled: opts.enabled ?? true,
  })
}

/**
 * Buy, equip and unequip all return the FULL refreshed catalogue, so every one
 * of them writes the server's answer straight into the cache rather than
 * invalidating.
 *
 * That is not an optimisation. Equipping displaces whatever shared the slot,
 * which changes a second tile the rider did not touch; a refetch would blank
 * the grid and re-run every image load to show it. The response already knows
 * the exact post-action state of all 29 items.
 *
 * Only `buy` touches the wallet, so only `buy` invalidates it.
 */
function useGearMutation(fn: (id: string) => Promise<Gear>, spendsCoins = false) {
  const qc = useQueryClient()
  return useMutation<Gear, Error, string>({
    mutationFn: fn,
    onSuccess: (gear) => {
      qc.setQueryData(GEAR_KEY, gear)
      if (spendsCoins) qc.invalidateQueries({ queryKey: WALLET_KEY })
      // Equipping changes the machine, so the build is now stale. Invalidated
      // rather than cleared: the garage keeps showing the previous bike while
      // the new one composes, which is far better than an empty stage.
      if (!spendsCoins) qc.invalidateQueries({ queryKey: BUILD_KEY })
    },
  })
}

export const useBuyGear = () => useGearMutation(buyGear, true)
export const useEquipGear = () => useGearMutation(equipGear)
export const useUnequipGear = () => useGearMutation(unequipGear)

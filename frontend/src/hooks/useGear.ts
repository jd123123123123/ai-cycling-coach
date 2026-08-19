import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buyGear, equipGear, fetchGear, unequipGear, type Gear } from '../api/gear'

export const GEAR_KEY = ['gear'] as const

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
    },
  })
}

export const useBuyGear = () => useGearMutation(buyGear, true)
export const useEquipGear = () => useGearMutation(equipGear)
export const useUnequipGear = () => useGearMutation(unequipGear)

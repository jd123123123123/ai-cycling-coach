import { useState } from 'react'
import { useBuyGear, useEquipGear, useGear, useUnequipGear } from '../../hooks/useGear'
import W3Gear from './W3Gear'
import W3LoadError from './W3LoadError'

/**
 * W3 · the gear shop, wired. Drop `<W3GearPanel />` into the garage.
 *
 * Owns the three mutations and the one piece of state they share — which item
 * is mid-flight — so `W3Gear` stays a pure function of props and can be
 * rendered from the preview route with fixtures.
 *
 * `busyId` is tracked here rather than read from any single mutation's
 * `isPending`, because three different mutations can each be the one in flight
 * and the grid only needs to know WHICH TILE is busy, not which verb it is.
 */
export default function W3GearPanel() {
  const { data: gear, isLoading, isError, refetch, isFetching } = useGear()
  const buy = useBuyGear()
  const equip = useEquipGear()
  const unequip = useUnequipGear()
  const [busyId, setBusyId] = useState<string | null>(null)

  const run = (m: { mutate: (id: string, o: object) => void }) => (id: string) => {
    setBusyId(id)
    m.mutate(id, { onSettled: () => setBusyId(null) })
  }

  // A FAILED FETCH IS NOT AN EMPTY SHOP. Without this branch `loading` was
  // false and `gear` null, so W3Gear fell into its skeleton and left a blank
  // grey box on screen permanently — indistinguishable from still loading.
  if (isError && !gear) {
    return (
      <W3LoadError
        title="Deine Ausrüstung lädt nicht"
        detail="Wir konnten deine Teile gerade nicht abrufen. Was dir gehört, bleibt dir — das ist nur die Verbindung."
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    )
  }

  return (
    <W3Gear
      gear={gear ?? null}
      loading={isLoading}
      busyId={busyId}
      onBuy={run(buy)}
      onEquip={run(equip)}
      onUnequip={run(unequip)} />
  )
}

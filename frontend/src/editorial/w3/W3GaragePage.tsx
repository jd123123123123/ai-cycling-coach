import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import W3GarageView from './W3GarageView'
import W3Loading from './W3Loading'
import { useEquipItem, useGarageCollection } from '../../hooks/useShop'
import type { ShopItem } from './w3shop'

/**
 * W3 · GARAGE (the GARAGE tab), wired. Route /e/w3-garage.
 *
 * ALL REAL:
 *  · balance ..... `GET /shop` (the same wallet the rest of the app spends from)
 *  · owned ....... `garage_items` — what this rider actually holds
 *  · loadout ..... `garage_loadout` — what they're actually riding
 *
 * The catalogue (names, prices, blurbs, art) is static and shipped with the
 * app, so this screen needs exactly one request and browsing costs nothing.
 *
 * The free starter bike is granted server-side on first read of `/shop`, which
 * is why there is no "claim your bike" step anywhere in the client: a rider who
 * has never opened the garage still owns a bike the moment they look.
 */
export default function W3GaragePage() {
  const navigate = useNavigate()
  const { data, isLoading } = useGarageCollection()
  const equip = useEquipItem()

  const owned = useMemo(() => new Set(data?.owned ?? []), [data?.owned])

  if (isLoading && !data) return <W3Loading label="Lade deine Garage…" />

  return (
    <W3GarageView
      balance={data?.balance ?? null}
      owned={owned}
      loadout={data?.loadout}
      busyId={equip.isPending ? (equip.variables ?? null) : null}
      onEquip={(item: ShopItem) => equip.mutate(item.id)}
      onOpenShop={() => navigate('/e/w3-shop')}
    />
  )
}

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import W3ShopView from './W3ShopView'
import W3Loading from './W3Loading'
import { useBuyItem, useEquipItem, useGarageCollection } from '../../hooks/useShop'
import type { ShopItem } from './w3shop'

/**
 * W3 · SHOP, wired. Route /e/w3-shop.
 *
 * The client never sends a price. `POST /shop/buy/{id}` carries an id and the
 * server charges what its own catalogue says, so the numbers on this screen are
 * a display of the deal, never the terms of it.
 *
 * FAILURES ARE TRANSLATED, NOT SWALLOWED. A purchase can fail for three honest
 * reasons and each one gets its own sentence — a rider who just watched a
 * "kaufen" button do nothing has no way to tell "you're broke" from "the
 * request died", and guessing on their behalf is how a shop loses trust.
 */
const nf = new Intl.NumberFormat('de-DE')

function purchaseError(err: unknown, item: ShopItem | null, balance: number | null): string {
  const status = err instanceof AxiosError ? err.response?.status : undefined
  if (status === 402) {
    const short = item && balance != null ? item.price - balance : null
    return short != null && short > 0
      ? `Dir fehlen noch ${nf.format(short)} RideCoin.`
      : 'Dafür reicht dein Guthaben nicht.'
  }
  if (status === 409) return 'Das gehört dir bereits.'
  if (status === 404) return 'Dieses Teil gibt es nicht mehr.'
  return 'Der Kauf hat nicht geklappt. Versuch es gleich noch einmal.'
}

export default function W3ShopPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useGarageCollection()
  const buy = useBuyItem()
  const equip = useEquipItem()
  const [error, setError] = useState<string | null>(null)

  const owned = useMemo(() => new Set(data?.owned ?? []), [data?.owned])
  const busyId = buy.isPending ? (buy.variables ?? null)
    : equip.isPending ? (equip.variables ?? null)
    : null

  if (isLoading && !data) return <W3Loading label="Lade den Shop…" />

  return (
    <W3ShopView
      balance={data?.balance ?? null}
      owned={owned}
      loadout={data?.loadout}
      busyId={busyId}
      error={error}
      onBuy={(item) => {
        setError(null)
        buy.mutate(item.id, {
          onError: (err) => setError(purchaseError(err, item, data?.balance ?? null)),
        })
      }}
      onEquip={(item) => {
        setError(null)
        equip.mutate(item.id, { onError: () => setError('Das Anlegen hat nicht geklappt.') })
      }}
      onBack={() => navigate('/e/w3-garage')}
      onDismissError={() => setError(null)}
    />
  )
}

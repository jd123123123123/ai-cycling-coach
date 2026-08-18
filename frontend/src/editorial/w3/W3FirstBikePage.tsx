import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import W3FirstBikeView from './W3FirstBikeView'
import W3Loading from './W3Loading'
import { markW3OnboardingSeen } from './w3Onboarding'
import { SHOP_BIKES } from './w3shop'
import { useClaimFirstBike, useGarageCollection } from '../../hooks/useShop'
import type { ShopItem } from './w3shop'

/**
 * W3 · Dein erstes Rad, wired. Route /e/w3-first-bike — the terminal step of
 * onboarding.
 *
 * This page is the one that ENDS onboarding: it marks the intro seen only once
 * the server has actually granted the bike. Marking it earlier (on arrival, or
 * on tap) would let a failed claim drop a rider into an app whose gate now
 * thinks they are done, with no bike and no way back to this screen.
 *
 * A rider who already owns a bike — everyone who onboarded before the ladder
 * shipped, and anyone returning to this URL — is shown the claimed state rather
 * than being offered a second free bike the server would refuse.
 */

function claimError(err: unknown): string {
  const status = err instanceof AxiosError ? err.response?.status : undefined
  if (status === 409) return 'Du hast schon ein Rad — es steht in deiner Garage.'
  if (status === 400) return 'Dieses Rad ist nicht das Startgeschenk.'
  if (status === 404) return 'Dieses Rad gibt es nicht.'
  return 'Das hat nicht geklappt. Versuch es gleich noch einmal.'
}

export default function W3FirstBikePage() {
  const navigate = useNavigate()
  const { data, isLoading } = useGarageCollection()
  const claim = useClaimFirstBike()
  const [error, setError] = useState<string | null>(null)

  // The catalogue decides what is free, not this screen — so adding a second
  // free bike later turns this into a picker with no change here.
  const options = useMemo<ShopItem[]>(() => SHOP_BIKES.filter((b) => b.price === 0), [])

  // Server truth, not the mutation's own success flag: a returning rider who
  // already has a bike must land on the claimed state too.
  const alreadyHasBike = data?.loadout.bike != null

  const enter = () => {
    markW3OnboardingSeen()
    navigate('/e/w3-today', { replace: true })
  }

  if (isLoading && !data) return <W3Loading label="Öffne deine Garage…" />

  return (
    <W3FirstBikeView
      options={options}
      claiming={claim.isPending}
      claimed={alreadyHasBike}
      error={error}
      onClaim={(item) => {
        setError(null)
        claim.mutate(item.id, {
          // Onboarding is over the moment the bike is really theirs.
          onSuccess: () => markW3OnboardingSeen(),
          onError: (err) => setError(claimError(err)),
        })
      }}
      onEnter={enter}
    />
  )
}

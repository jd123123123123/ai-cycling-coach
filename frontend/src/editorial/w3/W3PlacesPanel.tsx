import { useState } from 'react'
import W3PlacesView from './W3PlacesView'
import { useBackdrops, useBuyPlace, useSelectStage } from '../../hooks/useGarage'
import { purchaseError } from './w3purchase'

/**
 * The places gallery as a SECTION OF THE SHOP rather than a screen of its own.
 *
 * WHY IT MOVED. A backdrop is a thing you buy with RideCoin, and it was the one
 * buyable thing not sold where things are sold: it lived behind a "Orte" row in
 * the garage lane, two taps from the shop, which is how a rider ends up never
 * knowing the app has them. The gallery is unchanged — it still separates the
 * places the rider has actually ridden from the ones still on the map, and the
 * hand-written stages still carry no price because they are earned rather than
 * sold.
 *
 * Owns the mutations so `W3PlacesView` stays pure, the same split `W3GearPanel`
 * uses.
 */
export default function W3PlacesPanel() {
  const { data } = useBackdrops()
  const buy = useBuyPlace()
  const select = useSelectStage()
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <W3PlacesView
      embedded
      error={error}
      balance={data?.balance_rc ?? null}
      places={data?.places ?? []}
      backdrops={data?.backdrops ?? []}
      selected={data?.selected ?? ''}
      busySlug={busySlug}
      onBuy={(slug) => {
        setBusySlug(slug)
        setError(null)
        const place = data?.places.find((x) => x.slug === slug) ?? null
        buy.mutate(slug, {
          // `onSettled` rather than `onSuccess`: a refusal — 403 without the
          // stamp, 402 without the coins — must clear the spinner too, or the
          // card sits in a permanent buying state after the one failure the
          // rider is most likely to hit.
          onSettled: () => setBusySlug(null),
          onError: (err) => setError(purchaseError(
            err,
            place ? { price: place.price_rc } : null,
            data?.balance_rc ?? null,
          )),
        })
      }}
      onSelect={(id) => select.mutate(id)}
      onBack={() => {}} />
  )
}

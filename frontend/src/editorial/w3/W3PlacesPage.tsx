import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import W3PlacesView from './W3PlacesView'
import { useBackdrops, useBuyPlace, useSelectStage } from '../../hooks/useGarage'

/**
 * W3 · ORTE, wired. Route /e/w3-places.
 *
 * Owns the three mutations the gallery needs and nothing else — `W3PlacesView`
 * is pure presentation, the same split the shop uses.
 *
 * WHY BUYING AND SELECTING ARE SEPARATE ACTS. A bought place is not
 * automatically the place the bike stands in, for the same reason a bought part
 * is not auto-equipped: silently replacing the picture a rider looks at every
 * morning is worse than making them tap once more. The card says HIERHIN
 * STELLEN afterwards, so the second step is one tap and obvious.
 */
export default function W3PlacesPage() {
  const navigate = useNavigate()
  const { data } = useBackdrops()
  const buy = useBuyPlace()
  const select = useSelectStage()
  const [busySlug, setBusySlug] = useState<string | null>(null)

  return (
    <W3PlacesView
      balance={data?.balance_rc ?? null}
      places={data?.places ?? []}
      backdrops={data?.backdrops ?? []}
      selected={data?.selected ?? ''}
      busySlug={busySlug}
      onBuy={(slug) => {
        setBusySlug(slug)
        // `onSettled` rather than `onSuccess`: a refusal — 403 without the
        // stamp, 402 without the coins — must clear the spinner too, or the
        // card sits in a permanent buying state after the one failure the
        // rider is most likely to hit.
        buy.mutate(slug, { onSettled: () => setBusySlug(null) })
      }}
      onSelect={(id) => select.mutate(id)}
      onBack={() => navigate(-1)}
    />
  )
}

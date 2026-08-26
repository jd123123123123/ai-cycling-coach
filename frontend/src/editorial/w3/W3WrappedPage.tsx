import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import type { Wrapped } from '../../pages/WeeklyWrapped'
import W3WrappedView from './W3WrappedView'
import { buildWrappedVm } from './w3wrapped'
import W3Loading from './W3Loading'
import { useGarage, useRideScene } from '../../hooks/useGarage'

/**
 * W3 · Deine Woche, wired. Route /e/w3-wrapped.
 *
 * REAL, and reusing the endpoint the old dashboard's Wrapped already had:
 * `/analytics/weekly-wrapped` — totals, the coach's distance and saddle lines,
 * peak power with its comparison ladder, the week's best ride, daily effort,
 * planned TSS and the CTL move. Nothing here is generated for the deck; the
 * deck only decides what order to reveal it in.
 */
export default function W3WrappedPage() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'weekly-wrapped', 'de'],
    queryFn: async () =>
      (await apiClient.get<Wrapped>('/analytics/weekly-wrapped?locale=de')).data,
    staleTime: 60 * 60 * 1000,   // a week's summary does not move hourly
  })

  // THE RIDER'S OWN PICTURES. Both are cache reads the app already makes
  // elsewhere — the garage bike and the composed scene for the week's best
  // ride. Neither generates anything: a scene that has not been composed yet
  // simply is not there, and the slide falls back to its colour field.
  const { data: garage } = useGarage()
  const { data: scene } = useRideScene(data?.best_ride?.activity_id ?? null)

  const vm = useMemo(
    () => (data && data.has_rides
      ? buildWrappedVm(data, {
          bestRideScene: scene?.status === 'ok' ? scene.image_base64 ?? null : null,
          bike: garage?.bike?.image_base64 ?? null,
        })
      : null),
    [data, scene, garage],
  )

  if (isLoading) return <W3Loading label="Deine Woche…" />

  // A week with no rides gets no deck. A Wrapped that celebrates nothing is
  // worse than no Wrapped — it tells the rider the app was not paying attention.
  if (!vm) { navigate('/e/w3-today', { replace: true }); return null }

  return (
    <W3WrappedView
      vm={vm}
      onClose={() => navigate('/e/w3-today')}
      onShare={() => navigate('/e/w3-share')}
    />
  )
}

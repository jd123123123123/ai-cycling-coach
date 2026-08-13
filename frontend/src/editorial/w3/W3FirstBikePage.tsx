import { useNavigate } from 'react-router-dom'
import { useGarage } from '../../hooks/useGarage'
import W3FirstBikeView from './W3FirstBikeView'

/**
 * W3 · First bike, wired. Route /e/w3-first-bike. The onboarding step that
 * opens the garage: add your real bike, or skip and add it later.
 *
 * The cover shows whatever is actually in the garage — which on first run is
 * nothing. It used to show a stock "starter bike" and call it the rider's,
 * which then disagreed with every other surface once the garage became real
 * state. Skipping is fine; it just leaves the slot empty, and the Today hero
 * says so.
 */
export default function W3FirstBikePage() {
  const navigate = useNavigate()
  const { data: garage } = useGarage()
  return (
    <W3FirstBikeView
      bikeImageUrl={garage?.bike?.image_base64 ?? null}
      onContinue={() => navigate('/e/w3-today')}
      onDigitalize={() => navigate('/e/w3-bike-studio')}
    />
  )
}

import { useNavigate } from 'react-router-dom'
import { STARTER_BIKE } from './starterBike'
import W3FirstBikeView from './W3FirstBikeView'

/**
 * W3 · First bike, wired. Route /e/w3-first-bike. The final onboarding step:
 * the rider's starter bike, upgradeable with RideCoin. "This is my bike" lands
 * them on Today, where the reward loop begins.
 */
export default function W3FirstBikePage() {
  const navigate = useNavigate()
  return (
    <W3FirstBikeView
      bikeImageUrl={STARTER_BIKE}
      onContinue={() => navigate('/e/w3-today')}
    />
  )
}

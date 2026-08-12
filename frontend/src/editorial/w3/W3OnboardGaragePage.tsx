import { useNavigate } from 'react-router-dom'
import { STARTER_BIKE } from './starterBike'
import { markW3OnboardingSeen } from './w3Onboarding'
import W3OnboardGarageView from './W3OnboardGarageView'

/**
 * W3 · Onboarding 04, wired. Route /e/w3-onboard-garage. The final step: the
 * rider's starter bike. "Start riding" marks onboarding seen (localStorage)
 * and lands on Today, where the reward loop begins.
 */
export default function W3OnboardGaragePage() {
  const navigate = useNavigate()
  const finish = () => {
    markW3OnboardingSeen()
    navigate('/e/w3-today', { replace: true })
  }
  return (
    <W3OnboardGarageView
      bikeImageUrl={STARTER_BIKE}
      onStart={finish}
      onSkip={finish}
    />
  )
}

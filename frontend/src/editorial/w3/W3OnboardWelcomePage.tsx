import { useNavigate } from 'react-router-dom'
import { SHOWCASE_RIDER } from './showcaseRider'
import { markW3OnboardingSeen } from './w3Onboarding'
import W3OnboardWelcomeView from './W3OnboardWelcomeView'

/**
 * W3 · Onboarding 01, wired. Route /e/w3-onboard-welcome. First screen of the
 * first-open flow → devices. Skip finishes onboarding and lands on Today.
 */
export default function W3OnboardWelcomePage() {
  const navigate = useNavigate()
  const skip = () => {
    markW3OnboardingSeen()
    navigate('/e/w3-today', { replace: true })
  }
  return (
    <W3OnboardWelcomeView
      heroImageUrl={SHOWCASE_RIDER}
      onNext={() => navigate('/e/w3-onboard-devices')}
      onSkip={skip}
    />
  )
}
